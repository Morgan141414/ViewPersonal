from __future__ import annotations

from datetime import datetime, timedelta, timezone
import asyncio
import random
import uuid
from typing import Any

import httpx

from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import SessionLocal
from app.models.employee import Employee
from app.models.ai import AiObservation
from app.models.presence import PresenceEvent
from app.models.position import PositionEvent
from app.models.user import User
from app.services.auth import require_roles, get_current_user
from app.services.bootstrap import bootstrap_admin
from app.services.presence_state import get_current_presence
from app.services.insight_engine import generate_insights
from app.services.insight_timeline import generate_baseline_comparison
from app.services.insight_trends import generate_trends
from app.services.insight_recommendations import generate_recommendations
from app.services.alert_engine import generate_alerts
from app.services.compliance_engine import evaluate_zone_compliance
from app.services.ws import ws_manager

_oauth_states: dict[str, dict[str, Any]] = {}

_training_jobs: dict[str, dict[str, Any]] = {}


def _require_ai_ingest_key(request: Request) -> None:
    # If AI_INGEST_API_KEY is set, require it.
    expected = settings.ai_ingest_api_key
    if not expected:
        return
    got = request.headers.get("x-ai-api-key")
    if got != expected:
        raise HTTPException(status_code=401, detail="Invalid AI ingest key")


async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


async def login(request: Request) -> JSONResponse:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = create_access_token(subject=str(user.id), role=user.role)
        return JSONResponse({"access_token": token, "token_type": "bearer"})


async def oauth_google_start(_: Request) -> RedirectResponse:
    if not settings.oauth_google_client_id or not settings.oauth_google_redirect_url:
        raise HTTPException(status_code=400, detail="Google OAuth is not configured")

    state = str(uuid.uuid4())
    _oauth_states[state] = {
        "created_at": datetime.now(timezone.utc),
    }

    params = {
        "client_id": settings.oauth_google_client_id,
        "redirect_uri": settings.oauth_google_redirect_url,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth"
    query = "&".join([f"{k}={httpx.QueryParams({k: v})[k]}" for k, v in params.items()])
    return RedirectResponse(f"{url}?{query}")


async def oauth_google_callback(request: Request) -> RedirectResponse:
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Invalid OAuth callback")

    st = _oauth_states.get(state)
    if not st:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    created_at = st.get("created_at")
    if isinstance(created_at, datetime):
        if datetime.now(timezone.utc) - created_at > timedelta(seconds=settings.oauth_state_ttl_seconds):
            _oauth_states.pop(state, None)
            raise HTTPException(status_code=400, detail="OAuth state expired")
    _oauth_states.pop(state, None)

    if not settings.oauth_google_client_id or not settings.oauth_google_client_secret or not settings.oauth_google_redirect_url:
        raise HTTPException(status_code=400, detail="Google OAuth is not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.oauth_google_client_id,
                "client_secret": settings.oauth_google_client_secret,
                "redirect_uri": settings.oauth_google_redirect_url,
                "grant_type": "authorization_code",
            },
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
        if token_res.status_code >= 400:
            raise HTTPException(status_code=401, detail="OAuth token exchange failed")
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="OAuth token missing")

        userinfo_res = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_res.status_code >= 400:
            raise HTTPException(status_code=401, detail="OAuth userinfo failed")
        userinfo = userinfo_res.json()

    email = (userinfo.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="OAuth email missing")

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                password_hash=hash_password(str(uuid.uuid4())),
                role=settings.oauth_default_role,
                is_active=True,
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        token = create_access_token(subject=str(user.id), role=user.role)

    redirect_url = f"{settings.oauth_frontend_url.rstrip('/')}/oauth/callback?token={token}"
    return RedirectResponse(redirect_url)


async def register(request: Request) -> JSONResponse:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    role = (payload.get("role") or "admin").strip()
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    with SessionLocal() as db:
        require_roles(request, db, "admin")

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        user = User(
            email=email,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()

        token = create_access_token(subject=str(user.id), role=user.role)
        return JSONResponse({"access_token": token, "token_type": "bearer"})


async def me(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        user = get_current_user(request, db)
        return JSONResponse(
            {
                "id": str(user.id),
                "email": user.email,
                "role": user.role,
                "is_active": user.is_active,
            }
        )


async def training_jobs_list(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr", "manager")
    items = list(_training_jobs.values())
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return JSONResponse({"ok": True, "jobs": items})


async def training_job_create(request: Request) -> JSONResponse:
    payload = await request.json()
    name = (payload.get("name") or "Training job").strip()
    window_minutes = int(payload.get("window_minutes") or 60)
    window_minutes = max(5, min(24 * 60, window_minutes))
    sources = payload.get("sources") or []

    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr", "manager")

        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "name": name,
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "window_minutes": window_minutes,
            "sources": sources,
        }
        _training_jobs[job_id] = job
        return JSONResponse({"ok": True, "job": job}, status_code=201)


async def training_job_get(request: Request) -> JSONResponse:
    job_id = request.path_params.get("job_id")
    job = _training_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse({"ok": True, "job": job})


async def training_dataset_snapshot(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr", "manager")

        minutes = int(request.query_params.get("minutes") or 60)
        minutes = max(5, min(24 * 60, minutes))
        source_id = request.query_params.get("source_id")
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

        presence_q = db.query(PresenceEvent).filter(PresenceEvent.ts >= since)
        ai_q = db.query(AiObservation).filter(AiObservation.ts >= since)
        pos_q = db.query(PositionEvent).filter(PositionEvent.ts >= since)
        if source_id:
            presence_q = presence_q.filter(PresenceEvent.source_id == source_id)
            ai_q = ai_q.filter(AiObservation.source_id == source_id)
            pos_q = pos_q.filter(PositionEvent.source_id == source_id)

        presence_rows = presence_q.order_by(PresenceEvent.ts.desc()).limit(100).all()
        ai_rows = ai_q.order_by(AiObservation.ts.desc()).limit(100).all()
        pos_rows = pos_q.order_by(PositionEvent.ts.desc()).limit(100).all()

        return JSONResponse(
            {
                "ok": True,
                "window_minutes": minutes,
                "source_id": source_id,
                "counts": {
                    "presence": presence_q.count(),
                    "ai": ai_q.count(),
                    "position": pos_q.count(),
                },
                "samples": {
                    "presence": [
                        {
                            "ts": r.ts.isoformat(),
                            "event": r.event,
                            "source_id": r.source_id,
                            "employee_id": str(r.employee_id) if r.employee_id else None,
                            "anonymous_track_id": r.anonymous_track_id,
                            "confidence": r.confidence,
                        }
                        for r in presence_rows
                    ],
                    "ai": [
                        {
                            "ts": r.ts.isoformat(),
                            "source_id": r.source_id,
                            "employee_id": str(r.employee_id) if r.employee_id else None,
                            "kpi": r.kpi,
                            "activity": r.activity,
                            "emotion": r.emotion,
                        }
                        for r in ai_rows
                    ],
                    "position": [
                        {
                            "ts": r.ts.isoformat(),
                            "source_id": r.source_id,
                            "device_id": r.device_id,
                            "zone": r.zone,
                            "rssi": r.rssi,
                        }
                        for r in pos_rows
                    ],
                },
            }
        )


async def list_employees(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        employees = db.query(Employee).order_by(Employee.full_name).all()
        out = [
            {
                "id": str(e.id),
                "external_id": e.external_id,
                "full_name": e.full_name,
                "email": e.email,
                "is_active": e.is_active,
            }
            for e in employees
        ]
        return JSONResponse(out)


async def create_employee(request: Request) -> JSONResponse:
    payload = await request.json()
    external_id = payload.get("external_id")
    full_name = (payload.get("full_name") or "").strip()
    email = payload.get("email")
    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")

    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")

        if external_id:
            existing = db.query(Employee).filter(Employee.external_id == external_id).first()
            if existing:
                raise HTTPException(status_code=409, detail="external_id already exists")

        employee = Employee(
            external_id=external_id,
            full_name=full_name,
            email=email,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(employee)
        db.commit()
        db.refresh(employee)
        return JSONResponse(
            {
                "id": str(employee.id),
                "external_id": employee.external_id,
                "full_name": employee.full_name,
                "email": employee.email,
                "is_active": employee.is_active,
            },
            status_code=201,
        )


async def get_employee(request: Request) -> JSONResponse:
    employee_id = request.path_params.get("employee_id")
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        employee = db.get(Employee, uuid.UUID(employee_id))
        if not employee:
            raise HTTPException(status_code=404, detail="Not found")
        return JSONResponse(
            {
                "id": str(employee.id),
                "external_id": employee.external_id,
                "full_name": employee.full_name,
                "email": employee.email,
                "is_active": employee.is_active,
            }
        )


async def ingest_presence_event(request: Request) -> JSONResponse:
    payload = await request.json()
    event = (payload.get("event") or "").strip()
    if not event:
        raise HTTPException(status_code=400, detail="event is required")

    employee_id = payload.get("employee_id")
    anonymous_track_id = payload.get("anonymous_track_id")
    source_id = payload.get("source_id")
    confidence = payload.get("confidence")
    extra_payload = payload.get("payload") or {}
    ts_raw = payload.get("ts")
    ts = datetime.now(timezone.utc)
    if ts_raw:
        try:
            ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ts")

    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")

        pe = PresenceEvent(
            ts=ts,
            privacy_mode=settings.privacy_mode,
            employee_id=uuid.UUID(employee_id) if employee_id else None,
            anonymous_track_id=anonymous_track_id,
            source_id=source_id,
            event=event,
            confidence=float(confidence) if confidence is not None else None,
            payload=extra_payload,
        )
        db.add(pe)
        db.commit()
        db.refresh(pe)

        ws_manager.broadcast_json(
            {
                "type": "presence.event",
                "data": {
                    "id": str(pe.id),
                    "ts": pe.ts.isoformat(),
                    "privacy_mode": pe.privacy_mode,
                    "employee_id": str(pe.employee_id) if pe.employee_id else None,
                    "anonymous_track_id": pe.anonymous_track_id,
                    "source_id": pe.source_id,
                    "event": pe.event,
                    "confidence": pe.confidence,
                    "payload": pe.payload,
                },
            }
        )

        return JSONResponse(
            {
                "id": str(pe.id),
                "ts": pe.ts.isoformat(),
                "privacy_mode": pe.privacy_mode,
                "employee_id": str(pe.employee_id) if pe.employee_id else None,
                "anonymous_track_id": pe.anonymous_track_id,
                "source_id": pe.source_id,
                "event": pe.event,
                "confidence": pe.confidence,
                "payload": pe.payload,
            },
            status_code=201,
        )


async def ai_ingest_presence_event(request: Request) -> JSONResponse:
    # AI-service ingestion endpoint (API key based) so AI can push realtime presence.
    _require_ai_ingest_key(request)

    payload = await request.json()
    event = (payload.get("event") or "").strip()
    if not event:
        raise HTTPException(status_code=400, detail="event is required")

    employee_id = payload.get("employee_id")
    anonymous_track_id = payload.get("anonymous_track_id")
    source_id = payload.get("source_id")
    confidence = payload.get("confidence")
    extra_payload = payload.get("payload") or {}
    ts_raw = payload.get("ts")
    ts = datetime.now(timezone.utc)
    if ts_raw:
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ts")

    with SessionLocal() as db:
        pe = PresenceEvent(
            ts=ts,
            privacy_mode=settings.privacy_mode,
            employee_id=uuid.UUID(employee_id) if employee_id else None,
            anonymous_track_id=anonymous_track_id,
            source_id=source_id,
            event=event,
            confidence=float(confidence) if confidence is not None else None,
            payload=extra_payload,
        )
        db.add(pe)
        db.commit()
        db.refresh(pe)

        ws_manager.broadcast_json(
            {
                "type": "presence.event",
                "data": {
                    "id": str(pe.id),
                    "ts": pe.ts.isoformat(),
                    "privacy_mode": pe.privacy_mode,
                    "employee_id": str(pe.employee_id) if pe.employee_id else None,
                    "anonymous_track_id": pe.anonymous_track_id,
                    "source_id": pe.source_id,
                    "event": pe.event,
                    "confidence": pe.confidence,
                    "payload": pe.payload,
                },
            }
        )

        return JSONResponse({"ok": True, "id": str(pe.id)}, status_code=201)


async def current_presence(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        out = get_current_presence(db)
        # serialize datetime
        for row in out:
            row["last_seen_ts"] = row["last_seen_ts"].isoformat()
        return JSONResponse(out)


async def dev_seed(request: Request) -> JSONResponse:
    if settings.environment != "dev":
        raise HTTPException(status_code=404, detail="Not found")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    tracks = int(payload.get("tracks", 5))
    events_per_track = int(payload.get("events_per_track", 1))
    if tracks < 1 or tracks > 50:
        raise HTTPException(status_code=400, detail="tracks must be between 1 and 50")
    if events_per_track < 1 or events_per_track > 20:
        raise HTTPException(status_code=400, detail="events_per_track must be between 1 and 20")

    now = datetime.now(timezone.utc)
    sources = ["cam-1", "cam-2", "cam-3"]

    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")

        # create a few employees for later UI work (idempotent)
        seed_employees = [
            ("emp-001", "Alex Johnson", "alex.johnson@example.com"),
            ("emp-002", "Sam Lee", "sam.lee@example.com"),
            ("emp-003", "Taylor Kim", "taylor.kim@example.com"),
        ]

        employees_created = 0
        for external_id, full_name, email in seed_employees:
            existing = db.query(Employee).filter(Employee.external_id == external_id).first()
            if existing:
                continue
            db.add(
                Employee(
                    external_id=external_id,
                    full_name=full_name,
                    email=email,
                    is_active=True,
                    created_at=now,
                )
            )
            employees_created += 1

        events_created = 0
        for i in range(tracks):
            track_id = f"anon-{i + 1:03d}"
            for j in range(events_per_track):
                ts = now - timedelta(seconds=(i * 7 + j) * 3)
                pe = PresenceEvent(
                    ts=ts,
                    privacy_mode=settings.privacy_mode,
                    employee_id=None,
                    anonymous_track_id=track_id,
                    source_id=random.choice(sources),
                    event="seen",
                    confidence=round(random.uniform(0.72, 0.97), 2),
                    payload={"simulated": True, "seed": True},
                )
                db.add(pe)
                events_created += 1

        db.commit()

        # notify dashboard to refresh
        ws_manager.broadcast_json(
            {
                "type": "presence.seed",
                "data": {"tracks": tracks, "events_per_track": events_per_track, "events_created": events_created},
            }
        )

        return JSONResponse(
            {
                "ok": True,
                "employees_created": employees_created,
                "events_created": events_created,
                "tracks": tracks,
                "events_per_track": events_per_track,
            }
        )


async def ai_ingest_observation(request: Request) -> JSONResponse:
    _require_ai_ingest_key(request)
    payload = await request.json()

    ts_raw = payload.get("ts")
    ts = datetime.now(timezone.utc)
    if ts_raw:
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ts")

    employee_id = payload.get("employee_id")
    source_id = payload.get("source_id")

    with SessionLocal() as db:
        obs = AiObservation(
            ts=ts,
            employee_id=uuid.UUID(employee_id) if employee_id else None,
            source_id=source_id,
            face=payload.get("face"),
            activity=payload.get("activity"),
            emotion=payload.get("emotion"),
            kpi=payload.get("kpi"),
        )
        db.add(obs)
        db.commit()
        db.refresh(obs)

        ws_manager.broadcast_json(
            {
                "type": "ai.observation",
                "data": {
                    "id": str(obs.id),
                    "ts": obs.ts.isoformat(),
                    "employee_id": str(obs.employee_id) if obs.employee_id else None,
                    "source_id": obs.source_id,
                    "kpi": obs.kpi,
                },
            }
        )

        return JSONResponse({"ok": True, "id": str(obs.id)})


async def ai_current(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        # last 500, then pick latest per subject
        rows = db.query(AiObservation).order_by(AiObservation.ts.desc()).limit(500).all()
        latest: dict[str, AiObservation] = {}
        for r in rows:
            subject = str(r.employee_id) if r.employee_id else "unknown"
            if subject not in latest:
                latest[subject] = r

        out = []
        for subject, r in latest.items():
            out.append(
                {
                    "subject": subject,
                    "ts": r.ts.isoformat(),
                    "employee_id": str(r.employee_id) if r.employee_id else None,
                    "source_id": r.source_id,
                    "face": r.face,
                    "activity": r.activity,
                    "emotion": r.emotion,
                    "kpi": r.kpi,
                }
            )
        out.sort(key=lambda x: x["ts"], reverse=True)
        return JSONResponse(out)


async def chat_respond(request: Request) -> JSONResponse:
    payload = await request.json()
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    with SessionLocal() as db:
        get_current_user(request, db)
        presence = get_current_presence(db)
        insights = generate_insights(db, minutes=60)
        compliance = evaluate_zone_compliance(db)

    active = sum(1 for x in presence if (x.get("event") or "seen") == "active")
    idle = sum(1 for x in presence if (x.get("event") or "seen") == "idle")
    away = sum(1 for x in presence if (x.get("event") or "seen") == "away")
    total = len(presence)

    zones = compliance.get("zones", []) if isinstance(compliance, dict) else []
    violations = [z for z in zones if z.get("state") not in ("COMPLIANT", "UNKNOWN", "INITIALIZING")]

    msg = message.lower()
    reply_lines = [
        f"Краткий статус: активных {active}, бездействуют {idle}, отсутствуют {away} (всего {total}).",
        f"Нарушений по зонам: {len(violations)}.",
    ]

    if any(k in msg for k in ["наруш", "compliance", "зон", "штат"]):
        if violations:
            top = ", ".join([f"{z.get('zone_id')} — {z.get('state')}" for z in violations[:3]])
            reply_lines.append(f"Критичные зоны: {top}.")
        else:
            reply_lines.append("Сейчас критичных нарушений по зонам нет.")
    elif insights:
        top = insights[0]
        reply_lines.append(f"Инсайт: {top.get('title')} — {top.get('summary')}")

    suggestions = [
        "Покажи нарушения по зонам",
        "Какие камеры требуют внимания?",
        "Сводка за последний час",
    ]

    return JSONResponse(
        {
            "ok": True,
            "reply": " ".join(reply_lines),
            "ts": datetime.now(timezone.utc).isoformat(),
            "insights": insights[:3],
            "compliance": {"violations": len(violations)},
            "suggestions": suggestions,
        }
    )


async def position_ingest_event(request: Request) -> JSONResponse:
    _require_ai_ingest_key(request)
    payload = await request.json()

    device_id = (payload.get("device_id") or "").strip()
    source_id = (payload.get("source_id") or "").strip()
    zone = payload.get("zone")
    rssi = payload.get("rssi")
    ts_raw = payload.get("ts")
    if not device_id or not source_id:
        raise HTTPException(status_code=400, detail="device_id and source_id are required")

    ts = datetime.now(timezone.utc)
    if ts_raw:
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ts")

    with SessionLocal() as db:
        ev = PositionEvent(
            ts=ts,
            device_id=device_id,
            source_id=source_id,
            rssi=float(rssi) if rssi is not None else None,
            zone=zone,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)

        ws_manager.broadcast_json(
            {
                "type": "position.event",
                "data": {
                    "id": str(ev.id),
                    "ts": ev.ts.isoformat(),
                    "device_id": ev.device_id,
                    "zone": ev.zone,
                },
            }
        )
        return JSONResponse({"ok": True, "id": str(ev.id)})


async def position_heatmap(request: Request) -> JSONResponse:
    minutes = int(request.query_params.get("minutes", "60"))
    minutes = max(1, min(24 * 60, minutes))
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        rows = db.query(PositionEvent).filter(PositionEvent.ts >= since).all()

    zones: dict[str, int] = {}
    for r in rows:
        z = r.zone or "unknown"
        zones[z] = zones.get(z, 0) + 1
    return JSONResponse({"ok": True, "window_minutes": minutes, "zones": zones})


async def insights(request: Request) -> JSONResponse:
    minutes = int(request.query_params.get("minutes", "60"))
    source_id = request.query_params.get("source_id")
    zone = request.query_params.get("zone")
    minutes = max(5, min(24 * 60, minutes))
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        out = generate_insights(db, minutes=minutes, source_id=source_id, zone=zone)
        return JSONResponse({"ok": True, "window_minutes": minutes, "insights": out})


async def insights_timeline(request: Request) -> JSONResponse:
    minutes = int(request.query_params.get("minutes", "240"))
    bucket = int(request.query_params.get("bucket", "15"))
    source_id = request.query_params.get("source_id")
    minutes = max(15, min(24 * 60, minutes))
    bucket = max(5, min(120, bucket))
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        out = generate_baseline_comparison(db, minutes=minutes, bucket_minutes=bucket, source_id=source_id)
        return JSONResponse({"ok": True, **out})


async def insights_trends(request: Request) -> JSONResponse:
    days = int(request.query_params.get("days", "7"))
    source_id = request.query_params.get("source_id")
    days = max(3, min(90, days))
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        out = generate_trends(db, days=days, source_id=source_id)
        return JSONResponse({"ok": True, **out})


async def insights_recommendations(request: Request) -> JSONResponse:
    minutes = int(request.query_params.get("minutes", "60"))
    source_id = request.query_params.get("source_id")
    zone = request.query_params.get("zone")
    minutes = max(5, min(24 * 60, minutes))
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        out = generate_recommendations(db, minutes=minutes, source_id=source_id, zone=zone)
        return JSONResponse({"ok": True, "window_minutes": minutes, "recommendations": out})


async def alerts(request: Request) -> JSONResponse:
    minutes = int(request.query_params.get("minutes", "60"))
    source_id = request.query_params.get("source_id")
    zone = request.query_params.get("zone")
    minutes = max(5, min(24 * 60, minutes))
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr")
        out = generate_alerts(db, minutes=minutes, source_id=source_id, zone=zone)
        return JSONResponse({"ok": True, "window_minutes": minutes, "alerts": out})


async def compliance_zones(request: Request) -> JSONResponse:
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr", "manager")
        out = evaluate_zone_compliance(db)
        ws_manager.broadcast_json({"type": "compliance.zones", "data": out})
        return JSONResponse({"ok": True, "version": "1.0", **out})


async def compliance_zone_detail(request: Request) -> JSONResponse:
    zone_id = request.path_params.get("zone_id")
    with SessionLocal() as db:
        require_roles(request, db, "admin", "hr", "manager")
        out = evaluate_zone_compliance(db)
        zones = [z for z in out["zones"] if z.get("zone_id") == zone_id]
        if not zones:
            raise HTTPException(status_code=404, detail="Zone not found")
        zone = zones[0]
        ws_manager.broadcast_json({"type": "compliance.zone", "data": zone})
        return JSONResponse({"ok": True, "version": "1.0", "zone": zone})


async def compliance_version(_: Request) -> JSONResponse:
    return JSONResponse(
        {
            "ok": True,
            "version": "1.0",
            "event_schema": "/docs/compliance_event.schema.json",
        }
    )


async def _compliance_broadcast_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                out = evaluate_zone_compliance(db)
            ws_manager.broadcast_json({"type": "compliance.zones", "data": {"version": "1.0", **out}})
        except Exception:
            pass
        await asyncio.sleep(10)


async def ws_presence(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


async def startup() -> None:
    with SessionLocal() as db:
        bootstrap_admin(db)
    asyncio.create_task(_compliance_broadcast_loop())


routes = [
    Route("/v1/health", endpoint=health, methods=["GET"]),
    Route("/v1/auth/login", endpoint=login, methods=["POST"]),
    Route("/v1/auth/oauth/google/start", endpoint=oauth_google_start, methods=["GET"]),
    Route("/v1/auth/oauth/google/callback", endpoint=oauth_google_callback, methods=["GET"]),
    Route("/v1/auth/register", endpoint=register, methods=["POST"]),
    Route("/v1/auth/me", endpoint=me, methods=["GET"]),
    Route("/v1/dev/seed", endpoint=dev_seed, methods=["POST"]),
    Route("/v1/ai/observations", endpoint=ai_ingest_observation, methods=["POST"]),
    Route("/v1/ai/current", endpoint=ai_current, methods=["GET"]),
    Route("/v1/chat/respond", endpoint=chat_respond, methods=["POST"]),
    Route("/v1/ai/presence/events", endpoint=ai_ingest_presence_event, methods=["POST"]),
    Route("/v1/position/events", endpoint=position_ingest_event, methods=["POST"]),
    Route("/v1/position/heatmap", endpoint=position_heatmap, methods=["GET"]),
    Route("/v1/training/jobs", endpoint=training_jobs_list, methods=["GET"]),
    Route("/v1/training/jobs", endpoint=training_job_create, methods=["POST"]),
    Route("/v1/training/jobs/{job_id}", endpoint=training_job_get, methods=["GET"]),
    Route("/v1/training/datasets/snapshot", endpoint=training_dataset_snapshot, methods=["GET"]),
    Route("/v1/insights", endpoint=insights, methods=["GET"]),
    Route("/v1/insights/timeline", endpoint=insights_timeline, methods=["GET"]),
    Route("/v1/insights/trends", endpoint=insights_trends, methods=["GET"]),
    Route("/v1/insights/recommendations", endpoint=insights_recommendations, methods=["GET"]),
    Route("/v1/alerts", endpoint=alerts, methods=["GET"]),
    Route("/v1/compliance/zones", endpoint=compliance_zones, methods=["GET"]),
    Route("/v1/compliance/zones/{zone_id}", endpoint=compliance_zone_detail, methods=["GET"]),
    Route("/v1/compliance/version", endpoint=compliance_version, methods=["GET"]),
    Route("/v1/employees/", endpoint=list_employees, methods=["GET"]),
    Route("/v1/employees/", endpoint=create_employee, methods=["POST"]),
    Route("/v1/employees/{employee_id}", endpoint=get_employee, methods=["GET"]),
    Route("/v1/presence/events", endpoint=ingest_presence_event, methods=["POST"]),
    Route("/v1/presence/current", endpoint=current_presence, methods=["GET"]),
    WebSocketRoute("/ws/presence", endpoint=ws_presence),
]


app = Starlette(debug=settings.environment == "dev", routes=routes, on_startup=[startup])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import yaml

from app.services.presence_state import get_current_presence


@dataclass
class ZoneState:
    state: str
    since: datetime
    last_seen: datetime | None


_STATE_CACHE: dict[str, ZoneState] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load_model() -> dict[str, Any]:
    model_path = Path(__file__).resolve().parent.parent / "data" / "compliance_model.yaml"
    with model_path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _role_from_payload(payload: dict | None) -> str | None:
    if not payload:
        return None
    for key in ("role", "staff_role", "entity_role"):
        if payload.get(key):
            return str(payload.get(key))
    return None


def _event_payload(
    *,
    zone_id: str,
    regulation_id: str | None,
    state: str,
    violations: list[str],
    since: datetime,
    severity: str,
    ts: datetime,
) -> dict[str, Any]:
    return {
        "event_type": "compliance.zone",
        "zone_id": zone_id,
        "regulation_id": regulation_id,
        "state": state,
        "violations": violations,
        "since": since.isoformat(),
        "severity": severity,
        "ts": ts.isoformat(),
        "version": "1.0",
    }


def evaluate_zone_compliance(db, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or _now()
    model = _load_model()
    roles = {r["role_id"]: r for r in model.get("roles", [])}
    zones = model.get("zones", [])
    regulations = {r["zone_type"]: r for r in model.get("regulations", [])}

    # Map camera -> zone
    camera_to_zone: dict[str, str] = {}
    for z in zones:
        for cam in z.get("camera_ids", []) or []:
            camera_to_zone[str(cam)] = z["zone_id"]

    # Determine presence window based on regulations
    max_absence = 30
    for r in regulations.values():
        max_absence = max(max_absence, int(r.get("allowed_absence_seconds", 30)))
    since = now - timedelta(seconds=max_absence * 4)

    presence = get_current_presence(db, since=since)

    # Build role counts per zone
    zone_counts: dict[str, dict[str, int]] = {z["zone_id"]: {} for z in zones}
    zone_last_seen: dict[str, datetime | None] = {z["zone_id"]: None for z in zones}

    for p in presence:
        source_id = p.get("source_id") or ""
        zone_id = camera_to_zone.get(source_id)
        if not zone_id:
            continue
        role = _role_from_payload(p.get("payload") or {}) or "unknown"
        zone_counts[zone_id][role] = zone_counts[zone_id].get(role, 0) + 1
        zone_last_seen[zone_id] = p.get("last_seen_ts")

    zones_out: list[dict[str, Any]] = []
    events_out: list[dict[str, Any]] = []

    for z in zones:
        zone_id = z["zone_id"]
        zone_type = z.get("type")
        regulation = regulations.get(zone_type)
        regulation_id = regulation.get("regulation_id") if regulation else None

        if not regulation:
            zones_out.append(
                {
                    "zone_id": zone_id,
                    "regulation_id": regulation_id,
                    "state": "UNKNOWN",
                    "violations": ["no_regulation"],
                    "since": now.isoformat(),
                    "severity": "info",
                }
            )
            events_out.append(
                _event_payload(
                    zone_id=zone_id,
                    regulation_id=regulation_id,
                    state="UNKNOWN",
                    violations=["no_regulation"],
                    since=now,
                    severity="info",
                    ts=now,
                )
            )
            continue

        required = regulation.get("required_roles", {})
        forbidden = set(regulation.get("forbidden_roles", []) or [])
        allowed_absence = int(regulation.get("allowed_absence_seconds", 30))
        escalation = regulation.get("violation_escalation_seconds", {})
        severity = regulation.get("severity", "high")

        counts = zone_counts.get(zone_id, {})
        violations: list[str] = []
        computed_state = "COMPLIANT"

        # If no recent events
        if not zone_last_seen.get(zone_id):
            prev = _STATE_CACHE.get(zone_id)
            if not prev:
                computed_state = "INITIALIZING"
            else:
                computed_state = "UNKNOWN"
            state_since = prev.since if prev else now
            zones_out.append(
                {
                    "zone_id": zone_id,
                    "regulation_id": regulation_id,
                    "state": computed_state,
                    "violations": [],
                    "since": state_since.isoformat(),
                    "severity": "info",
                }
            )
            events_out.append(
                _event_payload(
                    zone_id=zone_id,
                    regulation_id=regulation_id,
                    state=computed_state,
                    violations=[],
                    since=state_since,
                    severity="info",
                    ts=now,
                )
            )
            _STATE_CACHE[zone_id] = ZoneState(computed_state, state_since, None)
            continue

        # Check forbidden / unauthorized
        for role_id in counts.keys():
            if role_id in forbidden:
                violations.append(f"forbidden:{role_id}")
            if role_id in roles:
                perms = roles[role_id].get("permissions", [])
                if zone_type not in perms:
                    violations.append(f"unauthorized:{role_id}")
            elif role_id != "unknown":
                violations.append(f"unauthorized:{role_id}")
            elif role_id == "unknown":
                violations.append("unauthorized:unknown")

        # Check required and max
        for role_id, cfg in required.items():
            cnt = counts.get(role_id, 0)
            min_req = int(cfg.get("min", 0))
            max_req = int(cfg.get("max", 999))
            if cnt < min_req:
                violations.append(f"missing:{role_id}")
                computed_state = "UNDERSTAFFED"
            if cnt > max_req:
                violations.append(f"over:{role_id}")
                computed_state = "OVERSTAFFED"

        if any(v.startswith("forbidden") or v.startswith("unauthorized") for v in violations):
            computed_state = "UNAUTHORIZED_PERSON"

        if not violations:
            computed_state = "COMPLIANT"

        prev = _STATE_CACHE.get(zone_id)
        state_since = prev.since if prev and prev.state == computed_state else now

        # Escalation to critical
        if computed_state in ("UNDERSTAFFED", "OVERSTAFFED"):
            threshold = int(escalation.get("understaffed", 120))
            if (now - state_since).total_seconds() > threshold:
                computed_state = "CRITICAL_VIOLATION"
        if computed_state == "UNAUTHORIZED_PERSON":
            threshold = int(escalation.get("unauthorized", 60))
            if (now - state_since).total_seconds() > threshold:
                computed_state = "CRITICAL_VIOLATION"

        _STATE_CACHE[zone_id] = ZoneState(computed_state, state_since, zone_last_seen.get(zone_id))

        zones_out.append(
            {
                "zone_id": zone_id,
                "regulation_id": regulation_id,
                "state": computed_state,
                "violations": violations,
                "since": state_since.isoformat(),
                "severity": severity,
            }
        )
        events_out.append(
            _event_payload(
                zone_id=zone_id,
                regulation_id=regulation_id,
                state=computed_state,
                violations=violations,
                since=state_since,
                severity=severity,
                ts=now,
            )
        )

    return {"zones": zones_out, "events": events_out}

from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone
import tempfile
import asyncio
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from PIL import Image
from sqlalchemy import select

from app.config import settings
from app.core_push import push_observation, push_position_event
from app.db import Base, SessionLocal, engine
from app.emotion import FerPlus, ensure_ferplus_model
from app.faceid import cosine_similarity, pack_embedding
from app.ingest import VideoIngestor
from app.kpi import compute_kpi
from app.models import FaceEmbedding, PositionEvent
from app.pose import classify_activity_from_pose
from app.schemas import AnalyzeImageOut, FaceEnrollOut, FaceIdentifyOut, HeatmapOut


def _decode_image_to_bgr(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    arr = np.array(img)[:, :, ::-1].copy()  # to BGR
    return arr


# Lazy singletons
_face_app = None
_fer = None
_pose_detector = None


def get_face_app():
    global _face_app
    if _face_app is not None:
        return _face_app

    try:
        from insightface.app import FaceAnalysis
    except Exception as e:
        raise RuntimeError(f"InsightFace not available: {e}")

    # Will auto-download models to ~/.insightface inside container.
    app = FaceAnalysis(name="buffalo_l")
    app.prepare(ctx_id=0, det_size=(640, 640))
    _face_app = app
    return _face_app


def get_fer():
    global _fer
    if _fer is not None:
        return _fer
    model_path = ensure_ferplus_model(settings.model_dir)
    _fer = FerPlus(model_path)
    return _fer


def get_pose_detector():
    global _pose_detector
    if _pose_detector is not None:
        return _pose_detector

    # MediaPipe task files are not bundled. For now we use the lightweight runtime pose landmarker via tasks API
    # by expecting a model file if user adds it. To keep this runnable out-of-the-box, we fall back to classic solutions.
    try:
        # If user provided a landmarker model, use it.
        model_path = f"{settings.model_dir.rstrip('/')}/pose_landmarker_lite.task"
        base_options = mp_python.BaseOptions(model_asset_path=model_path)
        options = mp_vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=mp_vision.RunningMode.IMAGE,
        )
        _pose_detector = mp_vision.PoseLandmarker.create_from_options(options)
        return _pose_detector
    except Exception:
        _pose_detector = None
        return None


app = FastAPI(title="AI Productivity Hub - AI Service", version="0.1.0")

# In dev we often open the dashboard via localhost, 127.0.0.1, or a LAN IP.
# Use a permissive origin regex for port 5173 so the browser can call AI APIs.
_dev_origin_regex = r"^https?://.*:5173$" if settings.environment == "dev" else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=_dev_origin_regex,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"] ,
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


_video_ingestors: dict[str, VideoIngestor] = {}


@app.on_event("startup")
def start_video_ingest_if_enabled() -> None:
    global _video_ingestors
    if not _video_ingestors:
        for source_id, video_source in settings.video_sources:
            _video_ingestors[source_id] = VideoIngestor(
                face_app_factory=get_face_app,
                fer_factory=get_fer,
                video_source=video_source,
                source_id=source_id,
            )

    if settings.enable_video_ingest:
        for ing in _video_ingestors.values():
            ing.start()


@app.on_event("shutdown")
def stop_video_ingest() -> None:
    global _video_ingestors
    for ing in _video_ingestors.values():
        ing.stop()


@app.get("/v1/health")
def health():
    if not _video_ingestors:
        ingest = {"running": False}
    else:
        # Keep legacy shape: expose the first ingestor status.
        first = next(iter(_video_ingestors.values()))
        ingest = first.status()
    return {"status": "ok", "ingest": ingest}


@app.get("/v1/ingest/status")
def ingest_status() -> JSONResponse:
    if not _video_ingestors:
        return JSONResponse({
            "running": False,
            "source": settings.video_source,
            "fps": settings.video_sample_fps,
            "frames_processed": 0,
        })
    st = next(iter(_video_ingestors.values())).status()
    return JSONResponse({
        "running": bool(st.get("running")),
        "source": st.get("source"),
        "fps": st.get("fps"),
        "frames_processed": st.get("frames_processed", 0),
    })


@app.get("/v1/ingest/status/all")
def ingest_status_all() -> JSONResponse:
    items = [ing.status() for ing in _video_ingestors.values()]
    return JSONResponse({"ok": True, "ingests": items})


@app.get("/v1/ingest/stream/{source_id}")
async def ingest_stream(source_id: str, fps: int = 60) -> StreamingResponse:
    ing = _video_ingestors.get(source_id)
    if ing is None:
        raise HTTPException(status_code=404, detail="unknown source_id")

    fps = int(fps)
    if fps < 1:
        fps = 1
    if fps > 60:
        fps = 60

    boundary = b"frame"

    async def gen():
        last_ts = 0.0
        while True:
            jpeg, ts = ing.get_preview_jpeg()
            if jpeg is None:
                await asyncio.sleep(0.2)
                continue

            # Don't resend identical frame timestamps too aggressively.
            if ts <= last_ts:
                await asyncio.sleep(0.05)
                continue
            last_ts = ts

            yield b"--" + boundary + b"\r\n"
            yield b"Content-Type: image/jpeg\r\n"
            yield f"Content-Length: {len(jpeg)}\r\n\r\n".encode("utf-8")
            yield jpeg
            yield b"\r\n"

            await asyncio.sleep(1.0 / float(fps))

    return StreamingResponse(gen(), media_type=f"multipart/x-mixed-replace; boundary={boundary.decode('ascii')}")


@app.post("/v1/ingest/start")
def ingest_start() -> JSONResponse:
    global _video_ingestors
    if not _video_ingestors:
        for source_id, video_source in settings.video_sources:
            _video_ingestors[source_id] = VideoIngestor(
                face_app_factory=get_face_app,
                fer_factory=get_fer,
                video_source=video_source,
                source_id=source_id,
            )
    for ing in _video_ingestors.values():
        ing.start()
    return JSONResponse({"ok": True, "ingests": [ing.status() for ing in _video_ingestors.values()]})


@app.post("/v1/ingest/stop")
def ingest_stop() -> JSONResponse:
    global _video_ingestors
    for ing in _video_ingestors.values():
        ing.stop()
    return JSONResponse({"ok": True, "ingests": [ing.status() for ing in _video_ingestors.values()]})


@app.post("/v1/face/enroll")
async def face_enroll(employee_id: str = Form(...), image: UploadFile = File(...)) -> FaceEnrollOut:
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid employee_id")

    image_bytes = await image.read()
    bgr = _decode_image_to_bgr(image_bytes)
    face_app = get_face_app()

    faces = face_app.get(bgr)
    if not faces:
        raise HTTPException(status_code=400, detail="no face detected")

    # choose best face by bbox area
    best = max(faces, key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))
    emb = best.embedding
    if emb is None:
        raise HTTPException(status_code=500, detail="embedding unavailable")

    emb = np.asarray(emb, dtype=np.float32)
    quality = float(getattr(best, "det_score", None) or 0.0)

    with SessionLocal() as db:
        row = FaceEmbedding(
            employee_id=emp_uuid,
            embedding_dim=int(emb.shape[0]),
            embedding=pack_embedding(emb),
            quality=quality,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    return FaceEnrollOut(ok=True, employee_id=str(emp_uuid), embedding_id=str(row.id), quality=quality)


@app.post("/v1/face/identify")
async def face_identify(image: UploadFile = File(...), top_k: int = Form(3)) -> FaceIdentifyOut:
    if top_k < 1 or top_k > 10:
        raise HTTPException(status_code=400, detail="top_k must be 1..10")

    image_bytes = await image.read()
    bgr = _decode_image_to_bgr(image_bytes)
    face_app = get_face_app()
    faces = face_app.get(bgr)
    if not faces:
        raise HTTPException(status_code=400, detail="no face detected")

    best = max(faces, key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))
    emb = np.asarray(best.embedding, dtype=np.float32)

    with SessionLocal() as db:
        rows = db.execute(select(FaceEmbedding)).scalars().all()

    scored: dict[str, float] = {}
    for r in rows:
        other = np.frombuffer(r.embedding, dtype=np.float32)
        score = cosine_similarity(emb, other)
        key = str(r.employee_id)
        scored[key] = max(scored.get(key, -1.0), score)

    matches = [
        {"employee_id": eid, "score": float(s)}
        for eid, s in sorted(scored.items(), key=lambda kv: kv[1], reverse=True)[:top_k]
    ]

    return FaceIdentifyOut(ok=True, matches=matches)


@app.post("/v1/vision/analyze_image")
async def analyze_image(
    image: UploadFile = File(...),
    employee_id: str | None = Form(None),
    source_id: str | None = Form(None),
) -> AnalyzeImageOut:
    image_bytes = await image.read()
    bgr = _decode_image_to_bgr(image_bytes)

    # Face
    face_app = get_face_app()
    faces = face_app.get(bgr)
    face_payload = None
    face_score = None
    if faces:
        best = max(faces, key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))
        face_score = float(getattr(best, "det_score", None) or 0.0)
        face_payload = {
            "bbox": [float(x) for x in best.bbox.tolist()],
            "det_score": face_score,
        }

    # Emotion (requires FER+ model file)
    emotion_label = None
    emotion_scores = None
    try:
        fer = get_fer()
        emotion_label, emotion_scores = fer.predict(bgr)
    except Exception:
        emotion_label, emotion_scores = None, None

    # Pose/activity (optional landmarker model)
    activity = "unknown"
    activity_conf = 0.0
    landmarks_out = None
    detector = get_pose_detector()
    if detector is not None:
        mp_image = mp_vision.MPImage(image_format=mp_vision.ImageFormat.SRGB, data=bgr[:, :, ::-1])
        result = detector.detect(mp_image)
        if result.pose_landmarks:
            landmarks = []
            for lm in result.pose_landmarks[0]:
                landmarks.append({"x": float(lm.x), "y": float(lm.y), "z": float(lm.z), "visibility": float(getattr(lm, "visibility", 0.0) or 0.0)})
            landmarks_out = landmarks
            activity, activity_conf = classify_activity_from_pose(landmarks_out)

    # KPI
    score, components = compute_kpi(face_score=face_score, activity=activity, emotion_label=emotion_label)

    out = AnalyzeImageOut(
        ok=True,
        face=face_payload,
        pose={"activity": activity, "confidence": activity_conf} if activity else None,
        emotion={"label": emotion_label, "scores": emotion_scores} if emotion_label and emotion_scores else None,
        kpi={"score": score, "components": components},
    )

    # Push to core (best effort)
    obs = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "employee_id": employee_id,
        "source_id": source_id,
        "face": face_payload,
        "activity": {"label": activity, "confidence": activity_conf},
        "emotion": {"label": emotion_label, "scores": emotion_scores},
        "kpi": {"score": score, "components": components},
    }
    await push_observation(obs)

    return out


@app.post("/v1/vision/analyze_video")
async def analyze_video(
    video: UploadFile = File(...),
    employee_id: str | None = Form(None),
    source_id: str | None = Form(None),
    sample_fps: int = Form(1),
    max_seconds: int = Form(30),
):
    # Lightweight demo video analyzer: samples frames, runs face detection + emotion, estimates activity from motion.
    sample_fps = max(1, min(5, int(sample_fps)))
    max_seconds = max(5, min(120, int(max_seconds)))

    video_bytes = await video.read()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as f:
        f.write(video_bytes)
        f.flush()

        cap = cv2.VideoCapture(f.name)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="invalid video")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        step = max(1, int(round(float(fps) / float(sample_fps))))
        max_frames = int(max_seconds * fps)

        face_app = get_face_app()
        fer = None
        try:
            fer = get_fer()
        except Exception:
            fer = None

        emotion_votes: dict[str, float] = {}
        det_scores: list[float] = []
        bbox_centers: list[tuple[float, float]] = []

        frame_idx = 0
        processed = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1
            if frame_idx > max_frames:
                break
            if (frame_idx % step) != 0:
                continue

            processed += 1
            faces = face_app.get(frame)
            if not faces:
                continue
            best = max(faces, key=lambda fa: float((fa.bbox[2] - fa.bbox[0]) * (fa.bbox[3] - fa.bbox[1])))
            det = float(getattr(best, "det_score", None) or 0.0)
            det_scores.append(det)
            x1, y1, x2, y2 = [float(x) for x in best.bbox.tolist()]
            bbox_centers.append(((x1 + x2) / 2.0, (y1 + y2) / 2.0))

            if fer is not None:
                try:
                    lbl, scores = fer.predict(frame)
                    emotion_votes[lbl] = emotion_votes.get(lbl, 0.0) + 1.0
                except Exception:
                    pass

        cap.release()

    face_score = float(sum(det_scores) / len(det_scores)) if det_scores else None
    emotion_label = max(emotion_votes.items(), key=lambda kv: kv[1])[0] if emotion_votes else None

    # Activity from motion of bbox centers
    activity = "unknown"
    activity_conf = 0.0
    if len(bbox_centers) >= 2:
        d = 0.0
        for (x1, y1), (x2, y2) in zip(bbox_centers, bbox_centers[1:]):
            d += ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        d = d / max(1, (len(bbox_centers) - 1))
        # very rough thresholds in pixels (depends on camera distance)
        if d < 2.0:
            activity = "idle"
            activity_conf = 0.6
        else:
            activity = "active"
            activity_conf = 0.7

    score, components = compute_kpi(face_score=face_score, activity=activity, emotion_label=emotion_label)

    obs = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "employee_id": employee_id,
        "source_id": source_id,
        "face": {"det_score": face_score, "frames": processed},
        "activity": {"label": activity, "confidence": activity_conf},
        "emotion": {"label": emotion_label, "scores": emotion_votes},
        "kpi": {"score": score, "components": components},
    }
    await push_observation(obs)

    return {"ok": True, "frames_processed": processed, **obs}


@app.post("/v1/position/events")
async def position_event(payload: dict) -> JSONResponse:
    device_id = (payload.get("device_id") or "").strip()
    source_id = (payload.get("source_id") or "").strip()
    rssi = payload.get("rssi")
    ts_raw = payload.get("ts")

    if not device_id or not source_id:
        raise HTTPException(status_code=400, detail="device_id and source_id are required")

    ts = datetime.now(timezone.utc)
    if ts_raw:
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="invalid ts")

    zone = settings.zone_map.get(source_id)

    with SessionLocal() as db:
        row = PositionEvent(
            device_id=device_id,
            source_id=source_id,
            rssi=float(rssi) if rssi is not None else None,
            zone=zone,
            ts=ts,
        )
        db.add(row)
        db.commit()

    await push_position_event(
        {
            "device_id": device_id,
            "source_id": source_id,
            "rssi": float(rssi) if rssi is not None else None,
            "zone": zone,
            "ts": ts.isoformat(),
        }
    )

    return JSONResponse({"ok": True, "zone": zone})


@app.get("/v1/position/heatmap")
def position_heatmap(minutes: int = 60) -> HeatmapOut:
    minutes = max(1, min(24 * 60, int(minutes)))
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    with SessionLocal() as db:
        rows = db.execute(select(PositionEvent).where(PositionEvent.ts >= since)).scalars().all()

    zones: dict[str, int] = {}
    for r in rows:
        z = r.zone or "unknown"
        zones[z] = zones.get(z, 0) + 1

    return HeatmapOut(ok=True, window_minutes=minutes, zones=zones)

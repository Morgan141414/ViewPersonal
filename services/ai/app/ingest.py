from __future__ import annotations

import asyncio
import logging
import threading
import time
import io
from dataclasses import dataclass, field
from datetime import datetime, timezone

import cv2
import numpy as np
from sqlalchemy import select

from app.behavior import BehaviorConfig, BehaviorSignals, BehaviorState, update_behavior_state

from app.config import settings
from app.core_push import push_observation, push_presence_event
from app.faceid import cosine_similarity
from app.models import FaceEmbedding
from app.db import SessionLocal
from app.pose import classify_pose_state


@dataclass
class SubjectState:
    last_status: str | None = None
    last_sent_ts: float = 0.0
    last_seen_ts: float = 0.0
    last_center: tuple[float, float] | None = None
    motion_ema: float = 0.0
    behavior: BehaviorState = field(default_factory=BehaviorState)
    last_pose: str | None = None
    last_pose_conf: float = 0.0


class FaceDbCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded_at = 0.0
        self._rows: list[tuple[str, np.ndarray]] = []  # (employee_id, embedding)

    def load(self, *, force: bool = False, min_interval_s: float = 3.0) -> None:
        now = time.time()
        if not force and (now - self._loaded_at) < min_interval_s:
            return
        with self._lock:
            if not force and (now - self._loaded_at) < min_interval_s:
                return
            with SessionLocal() as db:
                rows = db.execute(select(FaceEmbedding)).scalars().all()
            out: list[tuple[str, np.ndarray]] = []
            for r in rows:
                vec = np.frombuffer(r.embedding, dtype=np.float32)
                out.append((str(r.employee_id), vec))
            self._rows = out
            self._loaded_at = now

    def best_match(self, emb: np.ndarray) -> tuple[str | None, float]:
        self.load()
        best_id = None
        best_score = -1.0
        for employee_id, vec in self._rows:
            score = cosine_similarity(emb, vec)
            if score > best_score:
                best_score = score
                best_id = employee_id
        if best_score < settings.face_match_threshold:
            return None, float(best_score)
        return best_id, float(best_score)


class VideoIngestor:
    def __init__(self, *, face_app_factory, fer_factory=None, video_source: str | None = None, source_id: str | None = None) -> None:
        # Use Uvicorn's logger so messages show up in container logs by default.
        self._log = logging.getLogger("uvicorn.error")
        self._face_app_factory = face_app_factory
        self._fer_factory = fer_factory

        self._video_source = video_source or settings.video_source
        self._source_id = source_id or "camera-1"

        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._running = threading.Event()
        self._connected = threading.Event()
        self._last_error: str | None = None

        # For dashboard preview streaming (MJPEG): store latest JPEG frame.
        self._preview_lock = threading.Lock()
        self._preview_jpeg: bytes | None = None
        self._preview_ts: float = 0.0

        self._subjects: dict[str, SubjectState] = {}
        self._face_cache = FaceDbCache()
        self._synthetic_last_sent_ts: float = 0.0
        self._frames_processed: int = 0
        self._pose = None
        if settings.enable_pose:
            try:
                import mediapipe as mp

                self._pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=0,
                    enable_segmentation=False,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception:
                self._pose = None

        self._behavior_cfg = BehaviorConfig(
            active_confirm_seconds=int(settings.active_confirm_seconds),
            idle_seconds=int(settings.idle_seconds),
            away_seconds=int(settings.away_seconds),
        )

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._frames_processed = 0
        self._connected.clear()
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="video-ingest", daemon=True)
        self._thread.start()
        self._log.info("Video ingest started")

    def stop(self) -> None:
        self._stop.set()
        self._connected.clear()
        if self._thread:
            self._thread.join(timeout=2.0)

    def status(self) -> dict:
        return {
            # User-facing: "running" means the ingestor is connected and processing frames.
            "running": self._connected.is_set(),
            "source": self._video_source,
            "source_id": self._source_id,
            "fps": settings.video_sample_fps,
            "frames_processed": int(self._frames_processed),
            "last_error": self._last_error,
            "subjects": len(self._subjects),
            "pose": bool(self._pose is not None),
            "preview_ts": float(self._preview_ts),
        }

    def get_preview_jpeg(self) -> tuple[bytes | None, float]:
        with self._preview_lock:
            return self._preview_jpeg, float(self._preview_ts)

    def _update_preview(self, frame_bgr: np.ndarray) -> None:
        # Keep bandwidth reasonable: downscale large frames before JPEG.
        try:
            h, w = frame_bgr.shape[:2]
            max_w = 640
            if w > max_w:
                scale = max_w / float(w)
                nh = max(1, int(round(h * scale)))
                frame_bgr = cv2.resize(frame_bgr, (max_w, nh), interpolation=cv2.INTER_AREA)
            ok, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ok:
                return
            data = bytes(buf)
            with self._preview_lock:
                self._preview_jpeg = data
                self._preview_ts = time.time()
        except Exception:
            return

    def _open_capture(self):
        src = self._video_source
        cap = None
        # webcam index
        if src.isdigit():
            self._log.info("Connecting to webcam index %s", src)
            cap = cv2.VideoCapture(int(src))
        else:
            self._log.info("Connecting to %s", src)
            cap = cv2.VideoCapture()

            # Best-effort timeouts (not supported by all OpenCV backends/builds).
            open_timeout_prop = getattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC", None)
            read_timeout_prop = getattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC", None)
            if open_timeout_prop is not None:
                try:
                    cap.set(open_timeout_prop, float(max(1, settings.video_reconnect_seconds)) * 1000.0)
                except Exception:
                    pass
            if read_timeout_prop is not None:
                try:
                    cap.set(read_timeout_prop, float(max(1, settings.video_reconnect_seconds)) * 1000.0)
                except Exception:
                    pass

            try:
                cap.open(src)
            except Exception:
                pass
        return cap

    def _synthetic_status(self, now_ts: float) -> str:
        # Deterministic demo cycle: active -> idle -> distracted.
        # This keeps the product loop demonstrable even when the container
        # cannot access a physical webcam (common on Windows Docker Desktop).
        phase = int(now_ts) % 30
        if phase < 10:
            return "active"
        if phase < 20:
            return "idle"
        return "distracted"

    def _maybe_send_synthetic(self, loop: asyncio.AbstractEventLoop, *, reason: str) -> None:
        now_ts = time.time()
        if (now_ts - self._synthetic_last_sent_ts) < max(1, settings.presence_heartbeat_seconds):
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        status = self._synthetic_status(now_ts)

        presence_payload = {
            "ts": now_iso,
            "employee_id": None,
            "anonymous_track_id": "demo-stream",
            "source_id": self._source_id,
            "event": status,
            "confidence": 0.1,
            "payload": {"demo": True, "reason": reason, "video_source": self._video_source},
        }

        obs_payload = {
            "ts": now_iso,
            "employee_id": None,
            "source_id": self._source_id,
            "face": {"det_score": 0.0, "match_score": 0.0, "bbox": []},
            "activity": {"label": status, "confidence": 0.1},
            "pose": {"state": "unknown", "confidence": 0.0},
            "motion": {"value": 0.0, "threshold": float(settings.motion_active_threshold), "state": "unknown"},
            "emotion": {"label": "unknown", "scores": {}},
            "kpi": {"score": 0, "components": {}},
        }

        loop.run_until_complete(push_presence_event(presence_payload))
        loop.run_until_complete(push_observation(obs_payload))
        self._synthetic_last_sent_ts = now_ts

    def _run(self) -> None:
        self._running.set()
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            while not self._stop.is_set():
                cap = self._open_capture()
                if not cap or not cap.isOpened():
                    self._last_error = f"Cannot open video_source={self._video_source}"
                    self._connected.clear()
                    self._log.warning("%s", self._last_error)
                    try:
                        self._maybe_send_synthetic(loop, reason="video_open_failed")
                    except Exception as e:
                        self._last_error = f"{self._last_error}; synthetic_push_failed: {e}"
                    time.sleep(max(1, settings.video_reconnect_seconds))
                    continue

                self._last_error = None
                self._connected.set()
                self._log.info("Connected to %s", self._video_source)

                fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
                stride = max(1, int(round(float(fps) / float(max(1, settings.video_sample_fps)))))

                face_app = None
                try:
                    face_app = self._face_app_factory()
                except Exception as e:
                    self._last_error = f"Face model init failed: {e}"
                    cap.release()
                    time.sleep(max(1, settings.video_reconnect_seconds))
                    continue

                fer = None
                if self._fer_factory is not None:
                    try:
                        fer = self._fer_factory()
                    except Exception:
                        fer = None

                frame_idx = 0

                while not self._stop.is_set():
                    ok, frame = cap.read()
                    if not ok:
                        self._last_error = "Video read failed; reconnecting"
                        self._connected.clear()
                        self._log.warning("%s", self._last_error)
                        break

                    frame_idx += 1
                    if (frame_idx % stride) != 0:
                        continue

                    # Update preview from the same sampled frames we process.
                    self._update_preview(frame)

                    self._frames_processed += 1
                    if (self._frames_processed % 50) == 0:
                        self._log.info("Processing frames... frames_processed=%d", self._frames_processed)

                    now_ts = time.time()
                    now_iso = datetime.now(timezone.utc).isoformat()

                    faces = face_app.get(frame)
                    if not faces:
                        # No face in this sampled frame. Sweep prior subjects for AWAY.
                        for subject, st in list(self._subjects.items()):
                            if (now_ts - float(st.last_seen_ts or 0.0)) >= float(settings.away_seconds):
                                if st.last_status != "away" and (now_ts - st.last_sent_ts) >= 1.0:
                                    st.last_status = "away"
                                    st.last_sent_ts = now_ts
                                    presence_payload = {
                                        "ts": now_iso,
                                        "employee_id": None if subject.startswith("anon") else subject,
                                        "anonymous_track_id": subject if subject.startswith("anon") else None,
                                        "source_id": self._source_id,
                                        "event": "away",
                                        "confidence": 0.0,
                                        "payload": {"reason": "left_frame"},
                                    }
                                    obs_payload = {
                                        "ts": now_iso,
                                        "employee_id": None,
                                        "source_id": self._source_id,
                                        "face": {"det_score": 0.0, "match_score": 0.0, "bbox": []},
                                        "activity": {"label": "away", "confidence": 0.0},
                                        "pose": {"state": "left_frame", "confidence": 0.0},
                                        "motion": {"value": 0.0, "threshold": float(settings.motion_active_threshold)},
                                        "emotion": {"label": "unknown", "scores": {}},
                                        "kpi": {"score": 0, "components": {}},
                                    }
                                    loop.run_until_complete(push_presence_event(presence_payload))
                                    loop.run_until_complete(push_observation(obs_payload))
                        continue

                    # best face by bbox area
                    best = max(faces, key=lambda fa: float((fa.bbox[2] - fa.bbox[0]) * (fa.bbox[3] - fa.bbox[1])))
                    det_score = float(getattr(best, "det_score", None) or 0.0)
                    x1, y1, x2, y2 = [float(x) for x in best.bbox.tolist()]
                    center = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

                    emb = np.asarray(best.embedding, dtype=np.float32)
                    employee_id, match_score = self._face_cache.best_match(emb)

                    subject = f"{employee_id}@{self._source_id}" if employee_id else f"anon@{self._source_id}"
                    st = self._subjects.get(subject)
                    if st is None:
                        st = SubjectState()
                        self._subjects[subject] = st

                    st.last_seen_ts = now_ts

                    # Motion estimation (bbox center delta)
                    prev = st.last_center
                    if prev is not None:
                        motion = float(((center[0] - prev[0]) ** 2 + (center[1] - prev[1]) ** 2) ** 0.5)
                        st.motion_ema = 0.7 * st.motion_ema + 0.3 * motion
                    st.last_center = center

                    # Pose (optional)
                    pose_state = "unknown"
                    pose_conf = 0.0
                    if self._pose is not None:
                        try:
                            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            res = self._pose.process(rgb)
                            if res.pose_landmarks:
                                landmarks_out = []
                                for lm in res.pose_landmarks.landmark:
                                    landmarks_out.append(
                                        {
                                            "x": float(lm.x),
                                            "y": float(lm.y),
                                            "z": float(lm.z),
                                            "visibility": float(getattr(lm, "visibility", 0.0) or 0.0),
                                        }
                                    )
                                pose_state, pose_conf = classify_pose_state(
                                    landmarks_out,
                                    visibility_threshold=float(settings.pose_visibility_threshold),
                                )
                        except Exception:
                            pose_state, pose_conf = "unknown", 0.0
                    st.last_pose = pose_state
                    st.last_pose_conf = float(pose_conf)

                    # Emotion (optional)
                    emotion_label = None
                    emotion_scores = None
                    if fer is not None:
                        try:
                            emotion_label, emotion_scores = fer.predict(frame)
                        except Exception:
                            emotion_label, emotion_scores = None, None

                    # Behaviour Engine (rules)
                    status = update_behavior_state(
                        cfg=self._behavior_cfg,
                        st=st.behavior,
                        sig=BehaviorSignals(
                            face_present=True,
                            motion_value=float(st.motion_ema),
                            motion_threshold=float(settings.motion_active_threshold),
                        ),
                        now_ts=now_ts,
                    )

                    # Motion/pose detail states required by spec (kept in payload; UI can render later)
                    motion_state = "moving" if float(st.motion_ema) >= float(settings.motion_active_threshold) else "no_motion"
                    if status == "away":
                        motion_state = "left_frame"

                    # Emotion is soft-signal: stored in observation/payload, but doesn't override state.

                    should_send = False
                    if st.last_status != status:
                        should_send = True
                    elif (now_ts - st.last_sent_ts) >= settings.presence_heartbeat_seconds:
                        should_send = True

                    if not should_send:
                        continue

                    st.last_status = status
                    st.last_sent_ts = now_ts

                    # Push presence event to core
                    presence_payload = {
                        "ts": now_iso,
                        "employee_id": employee_id,
                        "anonymous_track_id": None if employee_id else subject,
                        "source_id": self._source_id,
                        "event": status,
                        "confidence": float(det_score),
                        "payload": {
                            "match_score": float(match_score),
                            "bbox": [x1, y1, x2, y2],
                            "motion_ema": float(st.motion_ema),
                            "motion_state": motion_state,
                            "pose_state": pose_state,
                            "pose_conf": float(pose_conf),
                        },
                    }

                    # Push AI observation (KPI will be computed in analyze endpoints; here we push minimal live observation)
                    obs_payload = {
                        "ts": now_iso,
                        "employee_id": employee_id,
                        "source_id": self._source_id,
                        "face": {"det_score": det_score, "match_score": match_score, "bbox": [x1, y1, x2, y2]},
                        "activity": {"label": status, "confidence": 0.7 if status != "unknown" else 0.0},
                        "pose": {"state": pose_state, "confidence": float(pose_conf)},
                        "motion": {"value": float(st.motion_ema), "threshold": float(settings.motion_active_threshold), "state": motion_state},
                        "emotion": {"label": emotion_label or "unknown", "scores": emotion_scores or {}},
                        "kpi": {"score": 0, "components": {}},
                    }

                    loop.run_until_complete(push_presence_event(presence_payload))
                    loop.run_until_complete(push_observation(obs_payload))

                cap.release()
                self._connected.clear()
                time.sleep(max(1, settings.video_reconnect_seconds))
        except Exception:
            self._log.exception("Video ingest loop crashed")
        finally:
            self._running.clear()
            self._connected.clear()
            try:
                loop.stop()
                loop.close()
            except Exception:
                pass

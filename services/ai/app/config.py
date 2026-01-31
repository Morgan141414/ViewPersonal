from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    environment: str
    core_api_url: str
    ai_ingest_api_key: str | None
    ai_db_url: str
    model_dir: str
    zone_map: dict[str, str]

    enable_video_ingest: bool

    video_source: str
    video_sources: list[tuple[str, str]]
    video_sample_fps: int
    video_reconnect_seconds: int
    presence_heartbeat_seconds: int
    idle_motion_threshold: float
    distracted_emotions: set[str]
    face_match_threshold: float

    # Behaviour Engine (rules)
    active_confirm_seconds: int
    idle_seconds: int
    away_seconds: int
    motion_active_threshold: float

    # Pose (optional-but-supported)
    enable_pose: bool
    pose_visibility_threshold: float


def load_settings() -> Settings:
    environment = os.getenv("ENVIRONMENT", "dev")
    core_api_url = os.getenv("CORE_API_URL", "")
    ai_db_url = os.getenv("AI_DB_URL", "sqlite+pysqlite:////data/ai.db")
    model_dir = os.getenv("MODEL_DIR", "/models")
    ai_ingest_api_key = os.getenv("AI_INGEST_API_KEY")

    zone_map_json = os.getenv("ZONE_MAP_JSON", "{}")
    try:
        zone_map = json.loads(zone_map_json)
        if not isinstance(zone_map, dict):
            zone_map = {}
    except Exception:
        zone_map = {}

    video_source = os.getenv("VIDEO_SOURCE", "0")

    # Multi-camera support: comma-separated list. Each item can be either:
    # - rtsp://... (id auto-generated camera-1, camera-2, ...)
    # - camera-1=rtsp://... (explicit id)
    # If not set, fall back to VIDEO_SOURCE.
    video_sources_raw = os.getenv("VIDEO_SOURCES", "").strip()
    video_sources: list[tuple[str, str]] = []
    if video_sources_raw:
        items = [x.strip() for x in video_sources_raw.split(",") if x.strip()]
        auto_idx = 1
        for it in items:
            if "=" in it:
                sid, surl = it.split("=", 1)
                sid = sid.strip() or f"camera-{auto_idx}"
                surl = surl.strip()
                if surl:
                    video_sources.append((sid, surl))
                auto_idx += 1
            else:
                video_sources.append((f"camera-{auto_idx}", it))
                auto_idx += 1
    else:
        video_sources = [("camera-1", video_source)]
    video_sample_fps = int(os.getenv("VIDEO_SAMPLE_FPS", "2"))
    video_reconnect_seconds = int(os.getenv("VIDEO_RECONNECT_SECONDS", "5"))
    presence_heartbeat_seconds = int(os.getenv("PRESENCE_HEARTBEAT_SECONDS", "5"))
    idle_motion_threshold = float(os.getenv("IDLE_MOTION_THRESHOLD", "2.0"))
    face_match_threshold = float(os.getenv("FACE_MATCH_THRESHOLD", "0.35"))

    active_confirm_seconds = int(os.getenv("ACTIVE_CONFIRM_SECONDS", "30"))
    idle_seconds = int(os.getenv("IDLE_SECONDS", "60"))
    away_seconds = int(os.getenv("AWAY_SECONDS", "120"))
    motion_active_threshold = float(os.getenv("MOTION_ACTIVE_THRESHOLD", str(idle_motion_threshold)))

    enable_pose = os.getenv("ENABLE_POSE", "1").strip().lower() in {"1", "true", "yes", "on"}
    pose_visibility_threshold = float(os.getenv("POSE_VISIBILITY_THRESHOLD", "0.35"))

    distracted_raw = os.getenv("DISTRACTED_EMOTIONS", "anger,sadness,fear,disgust")
    distracted_emotions = {x.strip() for x in distracted_raw.split(",") if x.strip()}

    enable_video_ingest = os.getenv("ENABLE_VIDEO_INGEST", "0").strip().lower() in {"1", "true", "yes", "on"}

    return Settings(
        environment=environment,
        core_api_url=core_api_url,
        ai_ingest_api_key=ai_ingest_api_key,
        ai_db_url=ai_db_url,
        model_dir=model_dir,
        zone_map=zone_map,

        enable_video_ingest=enable_video_ingest,

        video_source=video_source,
        video_sources=video_sources,
        video_sample_fps=video_sample_fps,
        video_reconnect_seconds=video_reconnect_seconds,
        presence_heartbeat_seconds=presence_heartbeat_seconds,
        idle_motion_threshold=idle_motion_threshold,
        distracted_emotions=distracted_emotions,
        face_match_threshold=face_match_threshold,

        active_confirm_seconds=active_confirm_seconds,
        idle_seconds=idle_seconds,
        away_seconds=away_seconds,
        motion_active_threshold=motion_active_threshold,

        enable_pose=enable_pose,
        pose_visibility_threshold=pose_visibility_threshold,
    )


settings = load_settings()

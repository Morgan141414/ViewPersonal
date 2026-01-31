# AI Service (Docker, Python 3.11)

This service runs the actual AI: FaceID (enroll/identify), pose/activity, emotion recognition, KPI scoring, and indoor positioning aggregation.

## Why separate from core
- Core API + dashboard stay lightweight and Windows-friendly.
- AI runs in an isolated Linux container with heavy deps and optional GPU acceleration.

## Run (CPU)
Prereq: Docker Desktop installed, **running**, and `docker` available in PATH.

From repo root:
- `docker compose -f infra/docker-compose.ai.yml up --build`

Then:
- AI API: http://127.0.0.1:9000/v1/health

By default the compose enables the 24/7 camera ingest loop (see `ENABLE_VIDEO_INGEST`).

Note: accessing a *host webcam* from a Linux container is environment-specific.

- On Windows Docker Desktop, a physical webcam usually isn't available inside the Linux container. In that case the service keeps running and emits a low-confidence synthetic stream (`demo-stream`) so you can still verify the end-to-end realtime pipeline (AI → core → dashboard).
- For real video frames on Windows, RTSP is the recommended path.

## Run (GPU)
Prereqs:
- NVIDIA drivers + WSL2 (Windows) + NVIDIA Container Toolkit

Then use the same compose file; it requests an NVIDIA GPU device if available.

## Endpoints (AI)
- `GET /v1/health`
- `GET /v1/ingest/status`
- `POST /v1/ingest/start`
- `POST /v1/ingest/stop`
- `POST /v1/face/enroll` (multipart: `employee_id`, `image`)
- `POST /v1/face/identify` (multipart: `image`)
- `POST /v1/vision/analyze_image` (multipart: `image`, optional `employee_id`)
- `POST /v1/position/events` (json)
- `GET /v1/position/heatmap`

## Integration
AI posts observations into core:
- `POST http://127.0.0.1:8000/v1/ai/observations`
- `POST http://127.0.0.1:8000/v1/position/events`

Set in compose env:
- `CORE_API_URL=http://host.docker.internal:8000`
- `AI_INGEST_API_KEY=dev_ai_key_change_me`

## Continuous ingest (webcam/RTSP)
The AI service can run a continuous loop that:
- connects to `VIDEO_SOURCE` (webcam index like `0` or `rtsp://...`)
- samples frames (`VIDEO_SAMPLE_FPS`)
- runs FaceID match (against enrolled embeddings in AI DB)
- estimates motion-based activity and optional emotion (FER+ if model present)
- generates realtime presence events (`active` / `idle` / `distracted`)
- pushes into core (`/v1/ai/presence/events` and `/v1/ai/observations`)

Key env vars (see [infra/docker-compose.ai.yml](infra/docker-compose.ai.yml)):
- `ENABLE_VIDEO_INGEST=1`
- `VIDEO_SOURCE=rtsp://user:pass@ip/stream` (or `0`)
- `VIDEO_SAMPLE_FPS=2`
- `PRESENCE_HEARTBEAT_SECONDS=5`
- `IDLE_MOTION_THRESHOLD=2.0`
- `DISTRACTED_EMOTIONS=anger,sadness,fear,disgust`

Dashboard can call AI directly for enroll/identify by setting:
- `VITE_AI_URL=http://127.0.0.1:9000`

## Models
This repo does not vend model weights.

Emotion (FER+): download the ONNX model to `services/ai/models`:
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe services/ai/scripts/download_ferplus_model.py`

Pose (optional): if you want MediaPipe pose landmarker, place `pose_landmarker_lite.task` into `services/ai/models`.

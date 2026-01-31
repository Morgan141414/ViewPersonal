# Технологический стек и библиотеки (рекомендация для продакшена)

Ниже — практичный стек “на вырост”: пилот запускается быстро, но архитектура не ломается при масштабировании.

## 1) Backend (Core)
- API: FastAPI, Uvicorn
- Модели/валидация: Pydantic
- БД: PostgreSQL + SQLAlchemy 2 + Alembic, драйвер `asyncpg`
- Real-time: WebSocket (FastAPI) + Redis pub/sub (или NATS)
- Очереди:
  - RabbitMQ: `pika`/`aio-pika`
  - Kafka: `confluent-kafka` (или `aiokafka`)
- Фоновые задачи: Celery (Redis/Rabbit) или Dramatiq
- Auth:
  - JWT: `python-jose`/`PyJWT`
  - Пароли: `passlib[bcrypt]`
  - Enterprise: Keycloak/OIDC (рекомендуется)
- Observability:
  - логи: `structlog`/`loguru`
  - метрики: `prometheus-client`
  - трейсы: OpenTelemetry

## 2) Edge (Video ingest / inference)
- Захват: GStreamer (RTSP) + OpenCV
- Кодеки/потоки: `gst-rtsp-server`/`ffmpeg` (по необходимости)
- Детекция лиц/людей:
  - лёгкий вариант: MediaPipe Face Detection
  - точный/масштабируемый: YOLO (ONNX/TensorRT) для people/face
- Face embeddings:
  - рекомендовано: InsightFace (ArcFace) + ONNXRuntime (CPU/GPU)
  - прототип/legacy: `face_recognition` (dlib) — тяжёлый, сложнее в проде
- Pose:
  - MediaPipe Pose (быстрый старт)
  - OpenPose (точнее, но тяжелее)

## 3) Behavior / Emotion (опционально, под политику)
- Поведение: MediaPipe Pose + правила/классификатор
- Эмоции:
  - FER/DeepFace/PyTorch модели
  - В проде: хранить только **агрегаты** и confidence, не кадры

## 4) Indoor positioning
- Collector: приём BLE/Wi‑Fi событий (зависит от оборудования)
- Алгоритмы: RSSI‑based зональная классификация + smoothing (Kalman/HMM)
- Карты: зона → координаты/полигоны

## 5) Time-series / аналитика
- TimescaleDB (Postgres extension) или InfluxDB
- Pandas, NumPy
- ML: scikit-learn, PyTorch

## 6) Frontend
- React + Vite
- UI: MUI/Ant Design
- Charts: ECharts/Recharts/Chart.js
- Realtime: WebSocket client

## 7) Infra
- Docker + Docker Compose для dev
- Nginx/Traefik для ingress
- Kubernetes для scale
- MinIO/S3 для хранения изображений/артефактов моделей
- Secrets: Vault или managed secrets (AWS/GCP/Azure)

## 8) Минимальные соглашения
- Event schemas: JSON Schema или Protobuf + версионирование
- API schemas: OpenAPI (FastAPI генерирует)
- Model registry: версии моделей + метаданные (accuracy, date, data policy)

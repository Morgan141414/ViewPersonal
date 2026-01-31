# AI Productivity Hub

> Архитектура и каркас проектирования системы «умного мониторинга сотрудников».

## Важно (приватность и законность)
Этот репозиторий предполагает **явное информирование и согласие**, минимизацию данных и строгий контроль доступа. Для продакшена обычно требуется:
- DPIA/PIA (оценка влияния на приватность), политика ретеншна, журналирование доступов.
- Ограничение целей обработки данных и минимизация биометрии.
- Режимы: (A) аналитика без идентификации, (B) идентификация только для контроля доступа, (C) агрегированные метрики по командам.

## Документация
- Архитектура и диаграммы: [docs/architecture.md](docs/architecture.md)
- PRD (требования): [docs/prd.md](docs/prd.md)
- План разработки (roadmap): [docs/roadmap.md](docs/roadmap.md)
- План объединения репозиториев: [docs/unification-plan.md](docs/unification-plan.md)
- Стек и библиотеки: [docs/tech-stack.md](docs/tech-stack.md)
- Риски/безопасность/приватность: [docs/risks-privacy-security.md](docs/risks-privacy-security.md)
- Compliance API: [docs/compliance_api.md](docs/compliance_api.md)

## Что реализовано
- Core API (Windows-friendly): Starlette + SQLite + WebSocket realtime.
- Dashboard: React (Presence + AI).
- AI service (Docker, Python 3.11): FaceID enroll/identify, emotion (FER+ при наличии модели), realtime 24/7 video ingest loop, пуш событий в core.

## Быстрый старт (уже реализовано в коде)
- Вариант A (если установлен Docker Compose): `docker-compose -f infra/docker-compose.yml up --build`
- Вариант B (без Docker, локально):
  - API: см. [services/api/README.md](services/api/README.md)
  - Dashboard: см. [apps/dashboard/README.md](apps/dashboard/README.md)

## AI сервис (Docker)
Для реального AI (FaceID/Emotion/Pose/KPI/Indoor Positioning) добавлен отдельный сервис:
- Документация: [services/ai/README.md](services/ai/README.md)
- Compose: `docker compose -f infra/docker-compose.ai.yml up --build`

После запуска:
- AI API: http://127.0.0.1:9000/v1/health
- Dashboard: http://127.0.0.1:5173 (вкладка **AI**)

Демо FaceID (2 сотрудника + идентификация) — ты указываешь свои изображения:
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe tools/ai_demo_faceid.py --emp1-img <path> --emp2-img <path> --query-img <path>`

Dev-admin создаётся автоматически при первом старте БД (см. `services/api/.env`).

Чтобы быстро увидеть real-time, можно сгенерировать события:
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe -m pip install -r services/api/requirements.txt`
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe tools/simulate_edge.py`

## E2E demo-run (камера → AI ingest → core → dashboard)

### 0) Предусловия
- Docker Desktop запущен (для AI service).
- В core задан общий ключ ingest (уже выставлен): `services/api/.env` содержит `AI_INGEST_API_KEY=dev_ai_key_change_me`.

### 1) Запуск core + dashboard (Windows, без Docker)
- Через VS Code Task: **Dev: run API + Dashboard**

или вручную:
- API:
  - `cd services/api`
  - `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe -m alembic upgrade head`
  - `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- Dashboard:
  - `cd apps/dashboard`
  - `npm install`
  - `npm run dev -- --host 127.0.0.1 --port 5173`

Открыть dashboard: http://127.0.0.1:5173

### 2) Запуск AI service (Docker)
- `docker compose -f infra/docker-compose.ai.yml up --build`

Проверка:
- AI health: http://127.0.0.1:9000/v1/health
- AI ingest status: http://127.0.0.1:9000/v1/ingest/status

### 3) Камера (working source)
- Зафиксировано: `VIDEO_SOURCE=0` (webcam index).
- На Windows Docker Desktop webcam часто **недоступна** внутри Linux-контейнера. В этом случае AI service всё равно работает 24/7 и будет отправлять synthetic demo-stream события, чтобы можно было проверить полный realtime-контур.
- Для реального видеопотока используйте RTSP URL (в `infra/docker-compose.ai.yml`).

### 4) Что увидеть
- Dashboard → вкладка **Presence**: таблица обновляется в real-time и показывает статус (`active` / `idle` / `distracted`) без ручного нажатия Analyze.
- Dashboard → вкладка **AI**: список текущих AI наблюдений и heatmap (при наличии событий).

## Definition of Done (зафиксировано)
- Есть один фиксированный camera source: `VIDEO_SOURCE=0`.
- AI service работает 24/7: reconnect + sampling + генерация статусов и пуш в core.
- Core принимает AI presence events по API key и рассылает WS.
- Dashboard обновляется в realtime без ручных кнопок (Presence статус виден).
- В репозитории есть короткий demo-run: как запустить и что увидеть.

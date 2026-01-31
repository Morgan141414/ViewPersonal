# API (Starlette)

## Local run (Windows)

1) Install Python deps (uses workspace venv):
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe -m pip install -r services/api/requirements.txt`

2) Run migrations (SQLite by default via `.env`):
- `cd services/api`
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe -m alembic upgrade head`

3) Start server:
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

## Smoke test
- `cd services/api`
- `D:/AI PRODUCTIVITY HUB/.venv/Scripts/python.exe smoke_test.py`

## Auth (dev)
On first start, admin is bootstrapped from `services/api/.env`:
- `admin@example.com` / `admin12345`

## Endpoints
- `GET /v1/health`
- `POST /v1/auth/login`
- `POST /v1/auth/register` (admin-only)
- `GET /v1/presence/current` (admin/hr)
- `POST /v1/presence/events` (admin/hr)
- `WS /ws/presence`

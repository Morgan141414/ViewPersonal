# Dev environment

Запуск всего стека (Postgres + Redis + API + Dashboard):

- `docker compose -f infra/docker-compose.yml up --build`

URLs:
- API: http://localhost:8000/v1/health
- Dashboard: http://localhost:5173

Примечание: в dev используется `.env.example` как env-файл для API. Для реальной среды сделай `services/api/.env`.

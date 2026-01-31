# Roadmap — план разработки (полноценный продукт)

Ниже — поэтапный план, который превращается в backlog. Этапы можно вести параллельно небольшими спринтами (1–2 недели).

## Этап 0 — Зафиксировать рамки (1 неделя)
**Выход:** финальные требования и ограничения.
- PRD (см. [docs/prd.md](prd.md))
- Матрица ролей (RBAC) и приватности (modes)
- Целевые метрики: latency, точность, объём данных, ретеншн
- Пилотные числа: N камер, N сотрудников, офис/зоны

## Этап 1 — Фундамент репозитория и инфраструктуры (1–2 недели)
**Выход:** проект запускается локально и в dev-среде.
- Monorepo структура: `services/`, `apps/`, `infra/`, `docs/`
- Docker Compose (Postgres + Redis + Timescale/Influx + Kafka/Rabbit)
- Observability: структурированные логи + метрики
- CI: линтеры/тесты/сборки

## Этап 2 — Event model и контракты (1 неделя)
**Выход:** единый контракт событий и API.
- Event envelope + версии схем
- Топики/очереди и правила ретраев
- Контракты API Gateway (REST + WS)

## Этап 3 — Core Backend (2–4 недели)
**Выход:** платформа данных работает end-to-end.
- `api-gateway`: auth, RBAC, WS
- `state-service`: текущий статус (Redis + persistence)
- `metrics-service`: запись в time-series
- Админ: устройства/зоны/политики

## Этап 4 — Edge Video Ingest (2–4 недели)
**Выход:** камера → события в шину.
- RTSP ingest (GStreamer/OpenCV)
- Детекция (MVP): лица или people detection
- Трекинг (MVP): track_id, heartbeats
- Privacy режимы (маскирование/не отправлять кадры)

## Этап 5 — Face-ID (опционально, 2–4 недели)
**Выход:** распознавание личности и управление энроллментом.
- Pipeline: detect→align→embedding→search
- База эмбеддингов, политика обновления
- Unknown/uncertain handling

## Этап 6 — Indoor Positioning (2–4 недели)
**Выход:** Wi‑Fi/BLE → зоны и карта.
- Collector → event normalizer
- Zone inference (правила/ML позже)
- Heatmaps по зонам

## Этап 7 — Behavior Analytics (опционально, 3–6 недель)
**Выход:** события позы/внимания; эмоции — только если разрешено.
- Pose (MediaPipe) → posture/ активности
- Inattention heuristics
- Quality gates: confidence + ограничения интерпретации

## Этап 8 — Scoring + Reporting (2–4 недели)
**Выход:** KPI, отчёты, рекомендации.
- Rules engine (прозрачные правила)
- Отчёты по сотруднику и агрегаты по командам
- Рекомендации (safe wording, без категоричных выводов)

## Этап 9 — Frontend Dashboard (2–4 недели)
**Выход:** usable UI.
- Live presence table (WS)
- Office map + zones
- Charts (time-series)
- Admin UI (минимум)

## Этап 10 — Security/Privacy hardening (параллельно, 2–6 недель)
**Выход:** готовность к продакшену.
- Threat model, audit logs, секреты
- Retention jobs, export/delete
- Разделение доступов и данных

## Этап 11 — QA, пилот, прод (2–6 недель)
**Выход:** стабильный релиз.
- Нагрузочное тестирование
- Пилот с реальными устройствами
- Руководство по установке и эксплуатации

## Рекомендуемый MVP (если цель — быстрее показать ценность)
1) Presence + zones (без Face-ID) → real-time dashboard
2) Потом добавлять Face-ID и Behavior, если политика позволяет

## Минимальные критерии приемки MVP
- События доходят от edge/сенсора до UI < 2с (90p)
- Есть аудит и RBAC
- Есть ретеншн и экспорт агрегатов
- Есть стабильный демонстрационный сценарий

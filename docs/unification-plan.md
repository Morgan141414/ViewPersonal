# План объединения репозиториев в единый продукт «AI Productivity Hub»

Цель: объединить сильные стороны двух прототипов (распознавание лиц, учёт присутствия, учёт рабочего времени, базовые отчёты) и надстроить недостающее: поведение/поза, (опционально) эмоции, роуминг‑позиционирование, real‑time дашборд, KPI и рекомендации, а также продакшен‑уровень приватности/безопасности.

## 1) Что у нас есть (as-is) и что берём как «референс»

### 1.1 Face Recognition Based Employee Attendance Logger (manisha-v)
Наблюдения по репозиторию:
- Flask монолит + SQLite.
- Захват с веб‑камеры через OpenCV.
- Распознавание через `face_recognition` (dlib) + хранение фотографий (training images) и CSV-лог посещаемости.
- Есть базовый UI и статистика (Plotly), CRUD сотрудников.
- Встречается face attribute анализ через `DeepFace`.

Что полезно для нас:
- Паттерн «камера → распознавание → запись посещаемости → отчёты».
- Статистика/страницы отчётности как UX-референс.

Что НЕ переносим напрямую:
- Монолитный подход и локальные файлы/CSV вместо событий/БД.
- Жёстко прошитые секреты, простая аутентификация (нужно переписать безопасно).

### 1.2 Employee and Work Monitoring System (karanyeole)
Наблюдения по репозиторию:
- Flask монолит + SQLite.
- Процесс регистрации с захватом набора изображений.
- Формирование базы известных лиц (pickle) и поток мониторинга, который пишет интервалы отсутствия в локальную БД `report.db`.
- Есть UX для HR/employee: просмотр рабочих часов/отчётов.

Что полезно для нас:
- Логика «start_work/end_work», расчёт рабочих часов и перерывов.
- Сущности HR/employee, отчёты по рабочему времени.

Что НЕ переносим напрямую:
- Локальные pickle/SQLite на файловой системе без версионирования и политики.
- Персональные отчёты по файлам в папках.

## 2) Архитектурный план (to-be): Edge + Stream + Core + Apps

Ключевая идея: **видео и сенсоры превращаются в события**, а Core строит состояние, метрики и визуализацию.

### 2.1 Сервисы (минимальный набор для «полного продукта»)
- **api-gateway** (FastAPI): REST + WebSocket, auth, RBAC, аудит, агрегации для UI.
- **identity-service**: сотрудники, команды, роли, политики приватности, зоны.
- **attendance-service**: события присутствия (on-site/zone/desk), смены, clock-in/out.
- **face-id-service**: эмбеддинги, поиск, энроллмент (без UI; всё через API).
- **video-ingest-edge** (Edge Agent): RTSP/USB ingest, детекция/трекинг, публикация событий.
- **behavior-service**: поза/внимание (MediaPipe/OpenPose), производит `behavior.*` события.
- **indoor-positioning-service**: Wi‑Fi/BLE события → зона/траектория.
- **scoring-service**: KPI/скоринг (правила → ML позже), рекомендации.
- **reporting-service**: периодические отчёты, экспорт.

### 2.2 Потоки данных (канонический event flow)
- Edge/video → `face.observed`, `person.track.updated`, `pose.updated`, `attention.updated`
- Indoor → `indoor.signal.observed` → `indoor.zone.updated`
- Core → `presence.updated`, `work.shift.updated`, `kpi.score.updated`, `recommendation.issued`

Рекомендуемая шина:
- Пилот: RabbitMQ (проще),
- Масштабирование: Kafka (высокая пропускная способность/ретеншн/consumer groups).

### 2.3 Схема (обновление к нашей architecture.md)
Смотри [docs/architecture.md](architecture.md) — там базовая C4/sequence. В рамках объединения добавляем понятие **work sessions** и **edge multi-camera**.

## 3) Стратегия интеграции двух исходных проектов

Важно: исходные репозитории — **прототипы/референсы**. В продукте мы:
- переносим **концепции/флоу**,
- переписываем реализацию под наш домен/безопасность/масштаб.

### 3.1 Что “реиспользуем” (на уровне функциональных блоков)
- Энроллмент/регистрация лица → превращаем в API-процесс (upload images → embedding → store).
- Распознавание из видео → превращаем в Edge Agent pipeline.
- Учёт посещаемости и отчёты → переносим в attendance-service/reporting-service.
- Учёт рабочего времени (start/end + absent intervals) → переносим как state machine в attendance-service.

### 3.2 Что объединяем в единый домен данных
Общая модель:
- `Employee`, `Department/Team`, `Role`, `Policy`
- `Device` (camera, beacon, edge node)
- `Zone` (office zones)
- `FaceTemplate` (embedding, version, quality)
- `PresenceEvent`, `WorkSession`, `ActivityMetric`, `KpiScore`, `Recommendation`

### 3.3 План миграции данных из прототипов
- Импорт сотрудников из SQLite (обоих прототипов) → PostgreSQL `employees`.
- Импорт фото/папок с изображениями → объектное хранилище (S3/MinIO) + ссылки.
- Импорт attendance CSV (если есть) → `presence_events` / `work_sessions`.
- Импорт локальных `report.db` (absent_for) → `work_sessions` + `activity_metrics`.

## 4) MVP-лестница (чтобы продукт стал «готовым», но поэтапно)

### MVP-1 (самый быстрый end-to-end)
- Edge: камера → people/face detection + track_id (можно без идентификации)
- Core: presence + zones (если есть indoor)
- UI: real-time присутствие + простые графики
- Security: RBAC + аудит

### MVP-2 (рабочее время)
- WorkSession state machine (clock-in/out, breaks, absent intervals)
- HR отчёты (день/неделя/месяц)

### MVP-3 (Face-ID)
- Энроллмент + распознавание, unknown handling
- Персистентная база эмбеддингов

### MVP-4 (Behavior)
- Pose + attention heuristics, confidence gating

### MVP-5 (Scoring + recommendations)
- Rules engine + explainability

## 5) Что считаем «полностью готовым продуктом» (Release criteria)
- Мульти‑камера + multi‑edge (хотя бы N=3) и устойчивость к падениям.
- Политики приватности/ретеншна и экспорт/удаление данных.
- Метрики/логи/трейсы, алерты.
- Обновляемость моделей (версии) и откат.
- Документация установки и эксплуатации.

## 6) Где смотреть список библиотек и риски
- Библиотеки/инструменты: [docs/tech-stack.md](tech-stack.md)
- Риски/безопасность/конфиденциальность: [docs/risks-privacy-security.md](risks-privacy-security.md)

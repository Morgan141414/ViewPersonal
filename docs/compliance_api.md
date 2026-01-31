# Compliance API (v1)

## Version
- `GET /v1/compliance/version`

Response:
```json
{
  "ok": true,
  "version": "1.0",
  "event_schema": "/docs/compliance_event.schema.json"
}
```

## Zones snapshot
- `GET /v1/compliance/zones`

Response:
```json
{
  "ok": true,
  "version": "1.0",
  "zones": [
    {
      "zone_id": "OR-1",
      "regulation_id": "OR_STANDARD",
      "state": "COMPLIANT",
      "violations": [],
      "since": "2026-01-31T10:22:10Z",
      "severity": "critical"
    }
  ],
  "events": [
    {
      "event_type": "compliance.zone",
      "zone_id": "OR-1",
      "regulation_id": "OR_STANDARD",
      "state": "COMPLIANT",
      "violations": [],
      "since": "2026-01-31T10:22:10Z",
      "severity": "critical",
      "ts": "2026-01-31T10:22:40Z",
      "version": "1.0"
    }
  ]
}
```

## Zone detail
- `GET /v1/compliance/zones/{zone_id}`

Response:
```json
{
  "ok": true,
  "version": "1.0",
  "zone": {
    "zone_id": "OR-1",
    "regulation_id": "OR_STANDARD",
    "state": "UNDERSTAFFED",
    "violations": ["missing:nurse"],
    "since": "2026-01-31T10:22:10Z",
    "severity": "critical"
  }
}
```

## WebSocket events
- Channel: `ws://<core>/ws/presence`
- Event types:
  - `compliance.zones` (snapshot push)
  - `compliance.zone` (single zone snapshot)

Event payload matches `docs/compliance_event.schema.json`.

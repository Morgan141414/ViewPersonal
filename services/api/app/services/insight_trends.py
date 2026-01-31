from __future__ import annotations

from datetime import datetime, timedelta, timezone
from collections import defaultdict

from app.models.presence import PresenceEvent


def _utc_day(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)


def generate_trends(db, days: int = 7, now: datetime | None = None, source_id: str | None = None) -> dict:
    days = max(3, min(90, int(days)))
    now = now or datetime.now(timezone.utc)

    start = _utc_day(now) - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)

    query = db.query(PresenceEvent).filter(PresenceEvent.ts >= prev_start)
    if source_id:
        query = query.filter(PresenceEvent.source_id == source_id)
    rows = query.order_by(PresenceEvent.ts.asc()).all()

    buckets = []
    for i in range(days):
        d = start + timedelta(days=i)
        buckets.append({"day": d.date().isoformat(), "total": 0, "active": 0, "idle": 0, "away": 0})

    prev_total = 0

    for r in rows:
        day = _utc_day(r.ts)
        evt = (r.event or "seen").lower()
        if day < start:
            prev_total += 1
            continue
        idx = (day - start).days
        if 0 <= idx < len(buckets):
            buckets[idx]["total"] += 1
            if evt in ("active", "idle", "away"):
                buckets[idx][evt] += 1

    current_total = sum(b["total"] for b in buckets)

    return {
        "days": days,
        "buckets": buckets,
        "current_total": current_total,
        "previous_total": prev_total,
    }

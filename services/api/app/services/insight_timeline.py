from __future__ import annotations

from datetime import datetime, timedelta, timezone
from collections import defaultdict

from app.models.presence import PresenceEvent


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_timeline(
    db,
    minutes: int = 240,
    bucket_minutes: int = 15,
    now: datetime | None = None,
    source_id: str | None = None,
) -> dict:
    now = now or _now()
    minutes = max(15, min(24 * 60, int(minutes)))
    bucket_minutes = max(5, min(120, int(bucket_minutes)))
    since = now - timedelta(minutes=minutes)

    query = db.query(PresenceEvent).filter(PresenceEvent.ts >= since)
    if source_id:
        query = query.filter(PresenceEvent.source_id == source_id)
    rows = query.order_by(PresenceEvent.ts.asc()).all()

    # Build buckets
    bucket_count = max(1, minutes // bucket_minutes)
    buckets = []
    for i in range(bucket_count):
        start = since + timedelta(minutes=i * bucket_minutes)
        buckets.append({"ts": start.isoformat(), "counts": {"seen": 0, "active": 0, "idle": 0, "away": 0}})

    for r in rows:
        idx = int((r.ts - since).total_seconds() // (bucket_minutes * 60))
        if idx < 0 or idx >= len(buckets):
            continue
        evt = (r.event or "seen").lower()
        if evt not in buckets[idx]["counts"]:
            evt = "seen"
        buckets[idx]["counts"][evt] += 1

    return {
        "minutes": minutes,
        "bucket_minutes": bucket_minutes,
        "buckets": buckets,
    }


def generate_baseline_comparison(
    db,
    minutes: int = 240,
    bucket_minutes: int = 15,
    now: datetime | None = None,
    source_id: str | None = None,
) -> dict:
    now = now or _now()
    minutes = max(15, min(24 * 60, int(minutes)))
    bucket_minutes = max(5, min(120, int(bucket_minutes)))

    current = generate_timeline(db, minutes=minutes, bucket_minutes=bucket_minutes, now=now, source_id=source_id)
    baseline_now = now - timedelta(minutes=minutes)
    baseline = generate_timeline(db, minutes=minutes, bucket_minutes=bucket_minutes, now=baseline_now, source_id=source_id)

    def total(tl: dict) -> int:
        return sum(
            b["counts"]["seen"]
            + b["counts"]["active"]
            + b["counts"]["idle"]
            + b["counts"]["away"]
            for b in tl["buckets"]
        )

    return {
        "current": current,
        "baseline": baseline,
        "current_total": total(current),
        "baseline_total": total(baseline),
    }

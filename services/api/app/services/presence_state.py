from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.presence import PresenceEvent


def get_current_presence(db: Session, *, since: datetime | None = None) -> list[dict]:
    stmt = select(PresenceEvent)
    if since is not None:
        stmt = stmt.where(PresenceEvent.ts >= since)
    stmt = stmt.order_by(desc(PresenceEvent.ts)).limit(5000)

    events: Iterable[PresenceEvent] = db.scalars(stmt).all()

    latest_by_subject: dict[str, PresenceEvent] = {}
    for e in events:
        subject = str(e.employee_id) if e.employee_id else (e.anonymous_track_id or "unknown")
        if subject not in latest_by_subject:
            latest_by_subject[subject] = e

    out: list[dict] = []
    for subject, e in latest_by_subject.items():
        out.append(
            {
                "subject": subject,
                "last_seen_ts": e.ts,
                "source_id": e.source_id,
                "event": e.event,
                "confidence": e.confidence,
                "privacy_mode": e.privacy_mode,
            }
        )
    return sorted(out, key=lambda x: x["last_seen_ts"], reverse=True)

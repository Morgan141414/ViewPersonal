from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.ai import AiObservation
from app.models.position import PositionEvent
from app.models.presence import PresenceEvent


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_insight(
    *,
    kind: str,
    severity: str,
    title: str,
    summary: str,
    meta: dict[str, Any] | None = None,
    ts: datetime | None = None,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": kind,
        "severity": severity,
        "title": title,
        "summary": summary,
        "ts": (ts or _now()).isoformat(),
        "meta": meta or {},
    }


def generate_insights(
    db,
    minutes: int = 60,
    now: datetime | None = None,
    source_id: str | None = None,
    zone: str | None = None,
) -> list[dict[str, Any]]:
    now = now or _now()
    minutes = max(5, min(24 * 60, int(minutes)))
    since = now - timedelta(minutes=minutes)

    insights: list[dict[str, Any]] = []

    # Presence-based insights
    presence_query = db.query(PresenceEvent).filter(PresenceEvent.ts >= since)
    if source_id:
        presence_query = presence_query.filter(PresenceEvent.source_id == source_id)
    presence_rows = presence_query.order_by(PresenceEvent.ts.asc()).all()
    if not presence_rows:
        insights.append(
            _make_insight(
                kind="no_presence",
                severity="info",
                title="No recent presence",
                summary=f"No presence events in the last {minutes} minutes.",
            )
        )
    else:
        counts = defaultdict(int)
        last_by_source: dict[str, datetime] = {}
        for r in presence_rows:
            counts[r.event] += 1
            if r.source_id:
                last_by_source[r.source_id] = r.ts

        total = len(presence_rows)
        idle = counts.get("idle", 0)
        away = counts.get("away", 0)
        active = counts.get("active", 0)

        idle_ratio = (idle + away) / max(1, total)
        if total >= 10 and idle_ratio >= 0.6:
            severity = "critical" if idle_ratio >= 0.8 else "warning"
            insights.append(
                _make_insight(
                    kind="idle_spike",
                    severity=severity,
                    title="High idle time",
                    summary=f"Idle/away events are {int(idle_ratio * 100)}% of activity in the last {minutes} min.",
                    meta={"idle": idle, "away": away, "total": total},
                )
            )

        if total >= 5 and active == 0:
            severity = "critical" if total >= 20 else "warning"
            insights.append(
                _make_insight(
                    kind="no_active",
                    severity=severity,
                    title="No active detections",
                    summary=f"No 'active' events detected in the last {minutes} minutes.",
                    meta={"total": total},
                )
            )

        for source_id, last_ts in last_by_source.items():
            if now - last_ts > timedelta(minutes=10):
                insights.append(
                    _make_insight(
                        kind="camera_quiet",
                        severity="warning",
                        title="No recent activity",
                        summary=f"Camera {source_id} has no presence activity for 10+ minutes.",
                        meta={"source_id": source_id, "last_seen": last_ts.isoformat()},
                    )
                )

    # Position / zone insights
    position_query = db.query(PositionEvent).filter(PositionEvent.ts >= since)
    if source_id:
        position_query = position_query.filter(PositionEvent.source_id == source_id)
    if zone:
        position_query = position_query.filter(PositionEvent.zone == zone)
    position_rows = position_query.order_by(PositionEvent.ts.asc()).all()
    if position_rows:
        zone_counts = defaultdict(int)
        for r in position_rows:
            zone = r.zone or "unknown"
            zone_counts[zone] += 1
        total_pos = len(position_rows)
        top_zone, top_count = max(zone_counts.items(), key=lambda x: x[1])
        if total_pos >= 10 and (top_count / total_pos) >= 0.6:
            ratio = top_count / total_pos
            severity = "critical" if ratio >= 0.8 else "warning"
            insights.append(
                _make_insight(
                    kind="zone_overload",
                    severity=severity,
                    title="Zone overloaded",
                    summary=f"Zone {top_zone} accounts for {int(ratio * 100)}% of traffic.",
                    meta={"zone": top_zone, "count": top_count, "total": total_pos},
                )
            )

        # Movement churn
        last_zone: dict[str, str | None] = {}
        transitions = 0
        for r in position_rows:
            prev = last_zone.get(r.device_id)
            if prev is not None and prev != r.zone:
                transitions += 1
            last_zone[r.device_id] = r.zone
        if transitions >= max(6, len(last_zone) * 2):
            insights.append(
                _make_insight(
                    kind="movement_churn",
                    severity="info",
                    title="Excessive movement",
                    summary=f"High zone switching detected ({transitions} transitions).",
                    meta={"transitions": transitions, "devices": len(last_zone)},
                )
            )

    # AI KPI insights
    ai_query = db.query(AiObservation).filter(AiObservation.ts >= since)
    if source_id:
        ai_query = ai_query.filter(AiObservation.source_id == source_id)
    ai_rows = ai_query.order_by(AiObservation.ts.asc()).all()
    if ai_rows:
        kpis = []
        for r in ai_rows:
            if isinstance(r.kpi, dict):
                score = r.kpi.get("score")
                if isinstance(score, (int, float)):
                    kpis.append(float(score))
        if len(kpis) >= 5:
            avg_kpi = sum(kpis) / len(kpis)
            if avg_kpi < 0.5:
                insights.append(
                    _make_insight(
                        kind="low_kpi",
                        severity="warning",
                        title="Low focus score",
                        summary=f"Average KPI score is {avg_kpi:.2f} in the last {minutes} minutes.",
                        meta={"avg_kpi": round(avg_kpi, 2), "samples": len(kpis)},
                    )
                )

    # Default insight if everything is quiet
    if not insights:
        insights.append(
            _make_insight(
                kind="stable",
                severity="info",
                title="All systems stable",
                summary=f"No significant issues detected in the last {minutes} minutes.",
            )
        )

    return insights

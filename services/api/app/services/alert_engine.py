from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.insight_engine import generate_insights


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _priority(severity: str) -> str:
    if severity == "critical":
        return "p1"
    if severity == "warning":
        return "p2"
    return "p3"


def _action(kind: str) -> str:
    return {
        "idle_spike": "Rebalance staffing",
        "zone_overload": "Open overflow station",
        "movement_churn": "Adjust layout/flow",
        "no_active": "Check signal/coverage",
        "low_kpi": "Schedule micro-break",
        "camera_quiet": "Check camera feed",
    }.get(kind, "Monitor")


def generate_alerts(
    db,
    minutes: int = 60,
    source_id: str | None = None,
    zone: str | None = None,
) -> list[dict[str, Any]]:
    insights = generate_insights(db, minutes=minutes, source_id=source_id, zone=zone)
    alerts: list[dict[str, Any]] = []

    for ins in insights:
        if ins.get("severity") == "info":
            continue
        alerts.append(
            {
                "id": ins.get("id"),
                "type": ins.get("type"),
                "severity": ins.get("severity"),
                "priority": _priority(str(ins.get("severity"))),
                "title": ins.get("title"),
                "summary": ins.get("summary"),
                "action": _action(str(ins.get("type"))),
                "ts": ins.get("ts") or _now().isoformat(),
                "meta": ins.get("meta") or {},
            }
        )

    return alerts

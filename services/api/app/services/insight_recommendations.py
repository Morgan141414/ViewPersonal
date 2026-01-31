from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.insight_engine import generate_insights


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rec(kind: str, title: str, summary: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": kind,
        "title": title,
        "summary": summary,
        "ts": _now().isoformat(),
        "meta": meta or {},
    }


def generate_recommendations(db, minutes: int = 60, source_id: str | None = None, zone: str | None = None) -> list[dict[str, Any]]:
    insights = generate_insights(db, minutes=minutes, source_id=source_id, zone=zone)
    recs: list[dict[str, Any]] = []

    for ins in insights:
        kind = ins.get("type")
        if kind == "idle_spike":
            recs.append(
                _rec(
                    "staffing_adjust",
                    "Reduce idle time",
                    "Reassign 1–2 staff or rotate tasks during this window to keep utilization balanced.",
                    {"source_id": source_id, "zone": zone},
                )
            )
        if kind == "zone_overload":
            recs.append(
                _rec(
                    "open_aux_station",
                    "Open auxiliary station",
                    "Add a temporary station or reroute flow to reduce congestion in the hotspot zone.",
                    {"source_id": source_id, "zone": zone},
                )
            )
        if kind == "movement_churn":
            recs.append(
                _rec(
                    "layout_optimize",
                    "Optimize movement path",
                    "Reduce unnecessary movement by adjusting layout or task sequence.",
                    {"source_id": source_id, "zone": zone},
                )
            )
        if kind == "no_active":
            recs.append(
                _rec(
                    "check_signal",
                    "Check signal or schedule",
                    "Verify camera placement and confirm staff coverage for this interval.",
                    {"source_id": source_id, "zone": zone},
                )
            )
        if kind == "low_kpi":
            recs.append(
                _rec(
                    "add_break",
                    "Consider a short break",
                    "Schedule a short break or micro‑rotation to recover focus scores.",
                    {"source_id": source_id, "zone": zone},
                )
            )

    if not recs:
        recs.append(
            _rec(
                "maintain",
                "Maintain current plan",
                "No action required. Continue monitoring for shifts in demand.",
                {"source_id": source_id, "zone": zone},
            )
        )

    return recs

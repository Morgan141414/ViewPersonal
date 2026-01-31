from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BehaviorConfig:
    active_confirm_seconds: int = 30
    idle_seconds: int = 60
    away_seconds: int = 120


@dataclass
class BehaviorSignals:
    face_present: bool
    motion_value: float
    motion_threshold: float


@dataclass
class BehaviorState:
    last_state: str | None = None
    face_present_since: float | None = None
    no_face_since: float | None = None
    motion_active_since: float | None = None
    no_motion_since: float | None = None


def _since(now_ts: float, since_ts: float | None) -> float:
    if since_ts is None:
        return 0.0
    return max(0.0, float(now_ts - since_ts))


def update_behavior_state(
    *,
    cfg: BehaviorConfig,
    st: BehaviorState,
    sig: BehaviorSignals,
    now_ts: float,
) -> str:
    """Rules engine (explainable): outputs one of active/idle/away.

    - active: face present AND motion>threshold sustained for cfg.active_confirm_seconds
    - idle: face present AND no motion for cfg.idle_seconds
    - away: no face for cfg.away_seconds

    Note: motion itself is provided by ingest (e.g. bbox-center EMA or frame-diff score).
    """

    motion_active = sig.motion_value >= sig.motion_threshold

    if sig.face_present:
        st.no_face_since = None
        st.face_present_since = st.face_present_since or now_ts

        if motion_active:
            st.no_motion_since = None
            st.motion_active_since = st.motion_active_since or now_ts
        else:
            st.motion_active_since = None
            st.no_motion_since = st.no_motion_since or now_ts
    else:
        st.face_present_since = None
        st.no_face_since = st.no_face_since or now_ts
        st.motion_active_since = None
        st.no_motion_since = None

    no_face_s = _since(now_ts, st.no_face_since)
    no_motion_s = _since(now_ts, st.no_motion_since)
    motion_active_s = _since(now_ts, st.motion_active_since)

    if no_face_s >= cfg.away_seconds:
        st.last_state = "away"
        return "away"

    if sig.face_present and no_motion_s >= cfg.idle_seconds:
        st.last_state = "idle"
        return "idle"

    if sig.face_present and motion_active_s >= cfg.active_confirm_seconds:
        st.last_state = "active"
        return "active"

    # Default behavior when not enough time accrued: keep prior state if reasonable.
    if st.last_state in {"active", "idle"} and sig.face_present:
        return st.last_state

    if st.last_state == "away" and sig.face_present:
        # First frame after returning: optimistic to active unless motion is clearly absent.
        if motion_active:
            st.last_state = "active"
            return "active"
        st.last_state = "idle"
        return "idle"

    # Cold start
    if sig.face_present:
        st.last_state = "active" if motion_active else "idle"
        return st.last_state

    st.last_state = "away"
    return "away"

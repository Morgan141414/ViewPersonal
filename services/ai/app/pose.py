from __future__ import annotations

import numpy as np


# MediaPipe Pose landmark indices (blazePose)
_L_SHOULDER = 11
_R_SHOULDER = 12
_L_HIP = 23
_R_HIP = 24
_L_KNEE = 25
_R_KNEE = 26
_L_ANKLE = 27
_R_ANKLE = 28


def _avg_y(landmarks: list[dict], idx_a: int, idx_b: int) -> float | None:
    try:
        return (float(landmarks[idx_a]["y"]) + float(landmarks[idx_b]["y"])) / 2.0
    except Exception:
        return None


def _avg_visibility(landmarks: list[dict], indices: list[int]) -> float:
    vals: list[float] = []
    for i in indices:
        try:
            vals.append(float(landmarks[i].get("visibility", 0.0) or 0.0))
        except Exception:
            vals.append(0.0)
    return float(sum(vals) / max(1, len(vals)))


def classify_pose_state(landmarks: list[dict] | None, *, visibility_threshold: float = 0.35) -> tuple[str, float]:
    """Classify posture from a single frame.

    Returns: (pose_state, confidence)
    pose_state ∈ {"sitting","standing","unknown"}
    """
    if not landmarks or len(landmarks) < 29:
        return "unknown", 0.0

    conf = _avg_visibility(
        landmarks,
        [_L_SHOULDER, _R_SHOULDER, _L_HIP, _R_HIP, _L_KNEE, _R_KNEE, _L_ANKLE, _R_ANKLE],
    )

    if conf < float(visibility_threshold):
        return "unknown", float(conf)

    hip_y = _avg_y(landmarks, _L_HIP, _R_HIP)
    knee_y = _avg_y(landmarks, _L_KNEE, _R_KNEE)
    ankle_y = _avg_y(landmarks, _L_ANKLE, _R_ANKLE)
    shoulder_y = _avg_y(landmarks, _L_SHOULDER, _R_SHOULDER)

    if hip_y is None or knee_y is None or ankle_y is None or shoulder_y is None:
        return "unknown", float(conf)

    # Image coordinates: y increases downward.
    hip_to_knee = float(knee_y - hip_y)
    knee_to_ankle = float(ankle_y - knee_y)
    shoulder_to_hip = float(hip_y - shoulder_y)

    # Heuristics are normalized-ish because MediaPipe landmarks are 0..1.
    # Standing: knees and ankles substantially below hips, torso present.
    if hip_to_knee > 0.12 and knee_to_ankle > 0.10 and shoulder_to_hip > 0.10:
        return "standing", float(conf)

    # Sitting: knees close to hips (folded legs), torso still present.
    if abs(hip_to_knee) < 0.08 and shoulder_to_hip > 0.08:
        return "sitting", float(conf)

    return "unknown", float(conf)


def classify_activity_from_pose(landmarks: list[dict] | None) -> tuple[str, float]:
    # Minimal heuristic classification from a single frame.
    # If we have landmarks, we can estimate "idle" vs "active" by landmark confidence.
    if not landmarks:
        return "unknown", 0.0

    vis = [float(p.get("visibility", 0.0)) for p in landmarks]
    conf = float(sum(vis) / max(len(vis), 1))

    # crude thresholds
    if conf < 0.35:
        return "unknown", conf

    # If key landmarks are visible we mark as "present" (movement requires temporal data)
    return "present", conf

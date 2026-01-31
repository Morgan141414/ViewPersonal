from __future__ import annotations


def compute_kpi(*, face_score: float | None, activity: str | None, emotion_label: str | None) -> tuple[float, dict[str, float]]:
    # 0..100 composite score
    components: dict[str, float] = {}

    # Face confidence (proxy for identification reliability)
    face_component = 50.0
    if face_score is not None:
        # face_score expected 0..1
        face_component = max(0.0, min(50.0, 50.0 * float(face_score)))
    components["face"] = face_component

    # Activity component
    activity_component = 25.0
    if activity == "unknown":
        activity_component = 10.0
    components["activity"] = activity_component

    # Emotion component
    emotion_component = 25.0
    if emotion_label in {"anger", "disgust", "fear", "sadness"}:
        emotion_component = 10.0
    elif emotion_label in {"happiness"}:
        emotion_component = 25.0
    elif emotion_label in {"neutral"}:
        emotion_component = 20.0
    components["emotion"] = emotion_component

    score = face_component + activity_component + emotion_component
    return float(max(0.0, min(100.0, score))), components

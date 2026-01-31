from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class HealthOut(BaseModel):
    status: str = "ok"


class FaceEnrollOut(BaseModel):
    ok: bool
    employee_id: str
    embedding_id: str
    quality: float | None = None


class FaceIdentifyMatch(BaseModel):
    employee_id: str
    score: float


class FaceIdentifyOut(BaseModel):
    ok: bool
    matches: list[FaceIdentifyMatch]


class EmotionOut(BaseModel):
    label: str
    scores: dict[str, float]


class PoseOut(BaseModel):
    # minimal pose summary (mediapipe)
    activity: str
    confidence: float


class KPIOut(BaseModel):
    score: float = Field(ge=0, le=100)
    components: dict[str, float]


class AnalyzeImageOut(BaseModel):
    ok: bool
    face: dict | None = None
    pose: PoseOut | None = None
    emotion: EmotionOut | None = None
    kpi: KPIOut | None = None


class PositionEventIn(BaseModel):
    device_id: str
    source_id: str
    rssi: float | None = None
    ts: datetime | None = None


class HeatmapOut(BaseModel):
    ok: bool
    window_minutes: int
    zones: dict[str, int]

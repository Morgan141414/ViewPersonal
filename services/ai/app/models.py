from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String, Uuid, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    model: Mapped[str] = mapped_column(String(64), default="insightface-buffalo_l")
    embedding_dim: Mapped[int] = mapped_column()
    embedding: Mapped[bytes] = mapped_column(LargeBinary)
    quality: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PositionEvent(Base):
    __tablename__ = "position_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    source_id: Mapped[str] = mapped_column(String(128))  # ap_id or beacon_id
    rssi: Mapped[float | None] = mapped_column(Float, nullable=True)
    zone: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))

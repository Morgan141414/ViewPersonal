from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, JSON, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AiObservation(Base):
    __tablename__ = "ai_observations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    employee_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    face: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    activity: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    emotion: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    kpi: Mapped[dict | None] = mapped_column(JSON, nullable=True)

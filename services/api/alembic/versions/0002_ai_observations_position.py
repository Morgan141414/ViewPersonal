"""ai observations + position events

Revision ID: 0002_ai_observations_position
Revises: 0001_init
Create Date: 2026-01-28

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_ai_observations_position"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_observations",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=True),
        sa.Column("source_id", sa.String(length=128), nullable=True),
        sa.Column("face", sa.JSON(), nullable=True),
        sa.Column("activity", sa.JSON(), nullable=True),
        sa.Column("emotion", sa.JSON(), nullable=True),
        sa.Column("kpi", sa.JSON(), nullable=True),
        sa.Index("ix_ai_observations_ts", "ts"),
        sa.Index("ix_ai_observations_employee_id", "employee_id"),
    )

    op.create_table(
        "position_events",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("source_id", sa.String(length=128), nullable=False),
        sa.Column("rssi", sa.Float(), nullable=True),
        sa.Column("zone", sa.String(length=128), nullable=True),
        sa.Index("ix_position_events_ts", "ts"),
        sa.Index("ix_position_events_device_id", "device_id"),
        sa.Index("ix_position_events_zone", "zone"),
    )


def downgrade() -> None:
    op.drop_table("position_events")
    op.drop_table("ai_observations")

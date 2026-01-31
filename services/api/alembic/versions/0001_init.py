"""init

Revision ID: 0001_init
Revises: 
Create Date: 2026-01-28

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "employees",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=True),
        sa.Column("full_name", sa.String(length=256), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("external_id", name="uq_employees_external_id"),
    )

    op.create_table(
        "presence_events",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("privacy_mode", sa.String(length=32), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=True),
        sa.Column("anonymous_track_id", sa.String(length=128), nullable=True),
        sa.Column("source_id", sa.String(length=128), nullable=True),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], name="fk_presence_employee"),
        sa.Index("ix_presence_events_ts", "ts"),
        sa.Index("ix_presence_events_employee_id", "employee_id"),
        sa.Index("ix_presence_events_anonymous_track_id", "anonymous_track_id"),
    )


def downgrade() -> None:
    op.drop_table("presence_events")
    op.drop_table("employees")
    op.drop_table("users")

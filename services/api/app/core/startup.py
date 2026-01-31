from __future__ import annotations

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.bootstrap import bootstrap_admin


def on_startup() -> None:
    db = SessionLocal()
    try:
        db.execute(text("select 1"))
        db.commit()
        bootstrap_admin(db)
    finally:
        db.close()

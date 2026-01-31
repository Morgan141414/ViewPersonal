from __future__ import annotations

import uuid

from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User


def get_current_user(request: Request, db: Session) -> User:
    auth = request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.scalar(select(User).where(User.id == uuid.UUID(user_id)))
    if not user or not user.is_active:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


def require_roles(request: Request, db: Session, *roles: str) -> User:
    user = get_current_user(request, db)
    if roles and user.role not in roles:
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Forbidden")
    return user

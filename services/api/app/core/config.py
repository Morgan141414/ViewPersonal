from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Literal

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    cors_allow_origins: list[str]
    database_url: str
    jwt_secret: str
    access_token_expire_minutes: int
    privacy_mode: Literal["anonymous", "pseudonymous", "identified"]
    bootstrap_admin_email: str | None
    bootstrap_admin_password: str | None
    ai_ingest_api_key: str | None
    oauth_google_client_id: str | None
    oauth_google_client_secret: str | None
    oauth_google_redirect_url: str | None
    oauth_frontend_url: str
    oauth_default_role: str
    oauth_state_ttl_seconds: int


def _load_settings() -> Settings:
    load_dotenv()

    cors = os.getenv("CORS_ALLOW_ORIGINS")
    cors_allow_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    if cors:
        try:
            cors_allow_origins = list(json.loads(cors))
        except Exception:
            cors_allow_origins = [x.strip() for x in cors.split(",") if x.strip()]

    database_url = os.getenv("DATABASE_URL")
    jwt_secret = os.getenv("JWT_SECRET")
    if not database_url:
        raise RuntimeError("DATABASE_URL env var is required")
    if not jwt_secret:
        raise RuntimeError("JWT_SECRET env var is required")

    return Settings(
        app_name=os.getenv("APP_NAME", "AI Productivity Hub API"),
        environment=os.getenv("ENVIRONMENT", "dev"),
        cors_allow_origins=cors_allow_origins,
        database_url=database_url,
        jwt_secret=jwt_secret,
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
        privacy_mode=os.getenv("PRIVACY_MODE", "anonymous"),
        bootstrap_admin_email=os.getenv("BOOTSTRAP_ADMIN_EMAIL"),
        bootstrap_admin_password=os.getenv("BOOTSTRAP_ADMIN_PASSWORD"),
        ai_ingest_api_key=os.getenv("AI_INGEST_API_KEY"),
        oauth_google_client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
        oauth_google_client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
        oauth_google_redirect_url=os.getenv("GOOGLE_OAUTH_REDIRECT_URL"),
        oauth_frontend_url=os.getenv("OAUTH_FRONTEND_URL", "http://127.0.0.1:5173"),
        oauth_default_role=os.getenv("OAUTH_DEFAULT_ROLE", "operator"),
        oauth_state_ttl_seconds=int(os.getenv("OAUTH_STATE_TTL_SECONDS", "600")),
    )


settings = _load_settings()

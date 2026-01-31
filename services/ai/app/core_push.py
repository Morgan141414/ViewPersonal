from __future__ import annotations

import httpx

from app.config import settings


async def push_observation(payload: dict) -> None:
    if not settings.core_api_url:
        return

    headers: dict[str, str] = {}
    if settings.ai_ingest_api_key:
        headers["x-ai-api-key"] = settings.ai_ingest_api_key

    url = settings.core_api_url.rstrip("/") + "/v1/ai/observations"
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.post(url, json=payload, headers=headers)
        except Exception:
            # best-effort
            return


async def push_position_event(payload: dict) -> None:
    if not settings.core_api_url:
        return

    headers: dict[str, str] = {}
    if settings.ai_ingest_api_key:
        headers["x-ai-api-key"] = settings.ai_ingest_api_key

    url = settings.core_api_url.rstrip("/") + "/v1/position/events"
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.post(url, json=payload, headers=headers)
        except Exception:
            return


async def push_presence_event(payload: dict) -> None:
    if not settings.core_api_url:
        return

    headers: dict[str, str] = {}
    if settings.ai_ingest_api_key:
        headers["x-ai-api-key"] = settings.ai_ingest_api_key

    url = settings.core_api_url.rstrip("/") + "/v1/ai/presence/events"
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.post(url, json=payload, headers=headers)
        except Exception:
            return

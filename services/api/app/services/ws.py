from __future__ import annotations

import asyncio
from typing import Any

from starlette.websockets import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        # best-effort
        try:
            self._connections.remove(websocket)
        except KeyError:
            return

    def broadcast_json(self, message: dict[str, Any]) -> None:
        # Fire-and-forget: schedule sends on current loop.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        for ws in list(self._connections):
            loop.create_task(self._safe_send(ws, message))

    async def _safe_send(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        try:
            await websocket.send_json(message)
        except Exception:
            self.disconnect(websocket)


ws_manager = WebSocketManager()

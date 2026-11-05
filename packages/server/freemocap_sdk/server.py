"""Core's server composition pattern with application-owned routes and lifecycle."""
from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from starlette.types import Lifespan

from freemocap_sdk._send_serializer import SendSerializer
from freemocap_sdk.stream import encode_message


class Connection:
    """One writer per connection; receive_json also handles client heartbeats."""

    def __init__(self, websocket: WebSocket) -> None:
        self.websocket = websocket
        self._sender = SendSerializer(websocket)

    async def send_bytes(self, data: bytes) -> None:
        if not await self._sender.send_raw_bytes(data):
            raise WebSocketDisconnect()

    async def send_message(self, kind: str, payload: Mapping[str, Any] | None = None,
                           *, timestamp: float = 0.0, sequence: int = 0, version: int = 0) -> None:
        await self.send_bytes(encode_message(kind, payload, timestamp=timestamp,
                                             sequence=sequence, version=version))

    async def receive_json(self) -> Any:
        while True:
            text = await self.websocket.receive_text()
            if text.startswith("ping"):
                await self._sender.send_raw_text("pong")
            elif text != "pong":
                return json.loads(text)


WebSocketHandler = Callable[[Connection], Awaitable[None]]


def create_app(*, title: str, routers: Sequence[APIRouter] = (),
               lifespan: Lifespan[FastAPI] | None = None,
               allowed_origins: Sequence[str] = (),
               websocket_handler: WebSocketHandler | None = None) -> FastAPI:
    """Compose a server without starting cameras, tasks, telemetry, or domain state.

    Routers carry their own prefixes. The application's lifespan owns its resources.
    The SDK accepts and closes each WebSocket; the handler owns its update loop.
    """
    app = FastAPI(title=title, lifespan=lifespan)
    if allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=list(allowed_origins),
                           allow_methods=["*"], allow_headers=["*"])
    for router in routers:
        app.include_router(router)

    @app.websocket("/websocket/connect")
    async def connect(websocket: WebSocket) -> None:
        # CORS middleware does not enforce WebSocket origins.
        origin = websocket.headers.get("origin")
        if origin and allowed_origins and "*" not in allowed_origins and origin not in allowed_origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        connection = Connection(websocket)
        close_code = 1000
        try:
            if websocket_handler is not None:
                await websocket_handler(connection)
            else:
                while True:
                    await connection.receive_json()
        except WebSocketDisconnect:
            pass
        except (json.JSONDecodeError, UnicodeDecodeError):
            close_code = 1008
        except Exception:
            close_code = 1011
            raise
        finally:
            if connection._sender.is_connected:
                await websocket.close(code=close_code)

    return app


def run_server(app: FastAPI, *, host: str = "127.0.0.1", port: int) -> None:
    """Run the composed application; Uvicorn drives its ASGI lifespan."""
    import uvicorn
    uvicorn.run(app, host=host, port=port)

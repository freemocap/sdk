from contextlib import asynccontextmanager

import cbor2
import pytest
from fastapi import APIRouter, WebSocketDisconnect
from fastapi.testclient import TestClient

from freemocap_sdk.server import create_app


def test_routes_lifecycle_binary_messages_and_heartbeat():
    events = []
    router = APIRouter(prefix="/example")

    @router.get("/state")
    def state():
        return {"ready": True}

    @asynccontextmanager
    async def lifespan(app):
        events.append("start")
        yield
        events.append("stop")

    async def updates(connection):
        await connection.send_message("example_state", {"ready": True}, timestamp=2.5, sequence=3)
        command = await connection.receive_json()
        await connection.send_message("example_reply", {"command": command})

    app = create_app(title="Example", routers=[router], lifespan=lifespan,
                     allowed_origins=["http://localhost:5176"], websocket_handler=updates)
    with TestClient(app) as client:
        assert events == ["start"]
        assert client.get("/example/state").json() == {"ready": True}
        with client.websocket_connect("/websocket/connect") as ws:
            assert cbor2.loads(ws.receive_bytes()) == {
                "kind": "example_state", "version": 0, "timestamp": 2.5, "sequence": 3, "ready": True}
            ws.send_text("ping")
            assert ws.receive_text() == "pong"
            ws.send_json({"action": "inspect"})
            assert cbor2.loads(ws.receive_bytes())["command"] == {"action": "inspect"}
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/websocket/connect", headers={"origin": "http://unlisted"}):
                pass
    assert events == ["start", "stop"]

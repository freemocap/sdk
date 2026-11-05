# FreeMoCap server infrastructure

The `freemocap-sdk-server` distribution supplies application-neutral server composition and self-describing stream encoding. It does not start cameras, trackers, processing jobs or telemetry, and does not install Core recording routes.

```python
import time
from fastapi import APIRouter
from freemocap_sdk.server import create_app, run_server

router = APIRouter(prefix="/api")

@router.get("/status")
def status():
    return {"ready": True}

async def updates(connection):
    await connection.send_message("example_state", {"ready": True},
                                  timestamp=time.time(), sequence=0)
    while True:
        command = await connection.receive_json()
        # Dispatch application commands here.

app = create_app(title="Example", routers=[router], websocket_handler=updates,
                 allowed_origins=["http://localhost:5176"])
if __name__ == "__main__":
    run_server(app, port=8006)
```

`run_server` is synchronous. `create_app` accepts an optional ASGI lifespan context manager; the application owns startup and cleanup of its resources. Routers carry their own prefixes. The SDK accepts/closes WebSockets at `/websocket/connect`, serializes sends, and handles text ping/pong while `receive_json` awaits application commands. Every binary message includes kind, version, timestamp and sequence. Register custom message kinds with the client; do not substitute incomplete payloads for Core kinds.

`freemocap_sdk.stream` exposes `encode_message`, `encode_frame_message`, `channel_block`, `tracker_observation`, `PayloadImage`, `encode_image_payload`, `uncalibrated_camera`, `Latest`, and `StreamConnection`. Image packing takes already encoded JPEG bytes and preserves SkellyCam's wire layout. Frame messages repeat their coordinate convention, cameras, model definitions and observations so each is independently interpretable. Numerical channels use packed arrays, not per-point dictionaries.

Run `uv sync --group dev` and `uv run pytest`. The conformance tests additionally use installed Core/SkellyCam when available and otherwise skip; the package itself imports neither. Source hashes and extraction paths are recorded in the repository's `provenance/` directory.

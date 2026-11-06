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


## Recording-level pipeline execution

`freemocap_sdk.pipeline` exports immutable `GraphDefinition`/`compile_graph`,
`PipelineRun`, `OperationContext`, `PipelineRegistry`, `pipeline_router` and
`stream_pipeline_snapshots`. The compiler validates semantic ports and DAG
bindings. The extracted resource-bounded executor currently executes recording
artifacts with `SAME_KEY` bindings; it does not implement per-frame scheduling.

The application admits one job and calls `run.execute(handlers,
resource_capacity={"compute": 1, "recording_io": 1})` inside its existing job
thread. Each handler receives `(inputs, context)` and returns exactly its declared
output ports. The application owns payload/hash validation, immutable publication,
preview/start/result routes and admission across its job types. The SDK owns no
additional run thread and never imports Core or numerical subprojects.

`context.check_cancelled()` is an explicit cooperative checkpoint.
`context.progress(completed, total, unit, detail)` and `context.artifacts(reads=(),
writes=())` update retained status. Reporting does not check cancellation: a
successful publication can report its outputs after a late cancel request.
Completion requires valid outputs from every node; real failures take precedence
over cancellation, and dependent nodes report `blocked` with `blocked_by` IDs.
Cancel remains pending while admitted handlers drain. Arbitrary native calls
cannot be preempted by this API. Application shutdown must cancel and join its jobs.

Register the run with `registry.add(run)` before executing. `pipeline_router`
provides list/detail and POST cancellation endpoints under a configurable prefix.
GET never starts work. Constructor `on_snapshot` and `subscribe(callback)` observers
are exception-isolated; callbacks must enqueue promptly rather than perform network
IO. Durable publication belongs in a handler, never an observer. Registry retention
lasts for the application process; durable attempt/result history is application-owned.

Compose `stream_pipeline_snapshots(connection, registry)` alongside the existing
connection's state/log forwarding tasks. Keep exactly one receive/heartbeat owner.
The forwarder keeps one pending full snapshot per run, coalesces intermediate
updates, preserves each terminal in the registry, and sends retained snapshots on
reconnect. A slow socket never blocks a worker. Cancel the forwarding coroutine
when the connection closes. Its version-1 wire shape is
`{kind: "pipeline_snapshot", version: 1, timestamp, sequence, snapshot}`; the nested
snapshot preserves nulls and avoids overwriting envelope fields. Register the
exported client `pipelineSnapshotKind`, then read `message.snapshot`.

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

For explicit desktop resources, `python -m freemocap_sdk.bundle` accepts repeatable
`--add-data SOURCE:DEST` mappings and forwards each intact to PyInstaller. For
example, `--add-data "src/example/workers/train.py:example/workers"` includes a
Python worker as a resource for a separate interpreter. The application chooses
the resources and destination; the SDK adds no trainer-specific files. Quote the
whole mapping when paths contain spaces. Existing `--collect-data PACKAGE`
remains available for package data discovery.


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

### Scalar metrics and sample previews

Handlers report actual scalar observations with
`context.metric("train-loss", label="Training loss", step=epoch, value=loss,
unit="loss", step_label="Epoch")`. Report calculated pixel error as a separate
series with `unit="px"`; absent metrics remain absent. IDs are scoped to the
operation. Labels and units remain stable, steps increase, and repeating the
latest step replaces its value. Nonfinite values and out-of-order steps fail
validation without publishing a partial update.

`context.preview("sample-left", label="Left sample", image_url="/artifacts/e2.png",
step=2, step_label="Epoch", checkpoint_id="epoch-2")` replaces a fixed sample's
preview. Publish the immutable image first. Root-relative or HTTP(S) URLs are
accepted; local paths and embedded images are not. The application owns overlays,
evaluation cadence, serving artifacts, and matching predictions to checkpoints.

Every snapshot contains full `metrics` and `previews` arrays, including empty
arrays before telemetry exists. The existing stream and terminal reconnect replay
carry them without another connection or prior-message dependency. Display history
retains the latest 2048 points per series by default; use
`PipelineRun(..., telemetry_point_limit=...)` to choose another limit (at least 2).
`omitted_points` reports discarded display observations. Each operation accepts
up to 32 scalar series and 16 fixed sample IDs. The application must save complete
history and artifacts separately; this bounded process-local display state is not
durable storage. Telemetry reports require a running operation and do not replace
explicit cancellation checkpoints.

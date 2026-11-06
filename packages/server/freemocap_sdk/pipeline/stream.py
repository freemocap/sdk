"""Run-keyed latest snapshots over the existing connection, never a second socket."""
import asyncio
from threading import Lock
from time import time
from .runtime import PipelineRegistry


async def stream_pipeline_snapshots(connection, registry: PipelineRegistry) -> None:
    """Forward full retained states, including terminals on reconnect.

    Memory is bounded to one pending snapshot per retained run, not per update.
    A worker only updates this mailbox and schedules at most one wakeup; it never
    waits on the socket. The APP continues owning the connection's receive loop.
    """
    loop = asyncio.get_running_loop()
    ready = asyncio.Event()
    lock = Lock()
    pending = {}
    newest = {}
    scheduled = False
    closed = False

    def accept(snapshot):
        nonlocal scheduled
        with lock:
            if closed or snapshot["sequence"] <= newest.get(snapshot["run_id"], -1):
                return
            newest[snapshot["run_id"]] = snapshot["sequence"]
            pending[snapshot["run_id"]] = snapshot
            if not scheduled:
                scheduled = True
                loop.call_soon_threadsafe(ready.set)

    unsubscribe = registry.subscribe(accept)
    try:
        while True:
            await ready.wait()
            with lock:
                batch = tuple(pending.values())
                pending.clear()
                ready.clear()
                scheduled = False
            for snapshot in batch:
                # Nested payload preserves nulls and prevents replacing reserved
                # envelope fields such as sequence with application payload keys.
                await connection.send_message("pipeline_snapshot", {"snapshot": snapshot},
                    timestamp=time(), sequence=snapshot["sequence"], version=1)
    finally:
        with lock:
            closed = True
            pending.clear()
        unsubscribe()

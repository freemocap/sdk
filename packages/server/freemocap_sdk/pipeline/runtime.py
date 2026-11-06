"""Retained graph runs; APP owns admission and the enclosing job lifetime."""
from collections.abc import Callable, Mapping
from concurrent.futures import CancelledError
from copy import deepcopy
from threading import Event, RLock
from time import perf_counter
from uuid import uuid4
import logging

from .definition import CompiledGraph, compile_graph
from .executor import execute_recording_graph, RecordingExecutionResult
from .progress import OperationProgressSnapshot

log = logging.getLogger(__name__)
TERMINAL = frozenset(("complete", "failed", "cancelled", "blocked"))


def observe(callback, snapshot):
    try:
        callback(deepcopy(snapshot))
    except Exception:
        log.exception("Pipeline snapshot observer failed")


class OperationContext:
    def __init__(self, run: "PipelineRun", node_id: str):
        self.run = run
        self.node_id = node_id

    def check_cancelled(self) -> None:
        if self.run._cancel.is_set():
            raise CancelledError("Pipeline cancelled")

    def progress(self, completed: int, total: int, unit: str, detail: str = "") -> None:
        # Reporting is not a cancellation checkpoint: after a successful atomic
        # publication, the handler may report its result despite a late request.
        self.run._update(self.node_id, completed=completed, total=total, unit=unit, detail=detail)

    def artifacts(self, *, reads=(), writes=()) -> None:
        with self.run._lock:
            old = self.run._operations[self.node_id]
            self.run._update(self.node_id,
                files_read=tuple(dict.fromkeys((*old.files_read, *map(str, reads)))),
                files_written=tuple(dict.fromkeys((*old.files_written, *map(str, writes)))))


class PipelineRun:
    def __init__(self, graph: CompiledGraph, *, labels: Mapping[str, str] | None = None,
                 on_snapshot: Callable[[dict], None] | None = None):
        # Recompile a supplied model so manually fabricated order cannot bypass validation.
        self.graph = compile_graph(graph.definition)
        self.run_id = str(uuid4())
        self._lock = RLock()
        self._cancel = Event()
        self._executed = False
        self._status = "queued"
        self._sequence = 0
        self._started: float | None = None
        self._finished: float | None = None
        self._node_started: dict[str, float] = {}
        self._error: str | None = None
        self._observers = [on_snapshot] if on_snapshot is not None else []
        self.result: RecordingExecutionResult | None = None
        nodes = {node.id: node for node in self.graph.definition.nodes}
        self._operations = {}
        for node_id in self.graph.topological_order:
            node = nodes[node_id]
            parents = tuple(dict.fromkeys(edge.source.node for edge in self.graph.definition.edges if edge.target.node == node_id))
            self._operations[node_id] = OperationProgressSnapshot(operation_id=node_id,
                label=(labels or {}).get(node_id, node_id), stage=node.stage, effects=node.effects,
                status="waiting", dependencies=parents, waiting_for=parents)

    def snapshot(self) -> dict:
        with self._lock:
            now = self._finished if self._finished is not None else perf_counter()
            return {"run_id": self.run_id, "sequence": self._sequence, "status": self._status,
                "cancel_requested": self._cancel.is_set(), "graph": self.graph.model_dump(mode="json"),
                "operations": [value.model_dump(mode="json") for value in self._operations.values()],
                "elapsed_seconds": max(0.0, now - self._started) if self._started is not None else 0.0,
                "error": self._error}

    def subscribe(self, callback: Callable[[dict], None]) -> Callable[[], None]:
        """Observe snapshots; callbacks should enqueue promptly, never perform network IO."""
        with self._lock:
            self._observers.append(callback)
        def unsubscribe():
            with self._lock:
                if callback in self._observers:
                    self._observers.remove(callback)
        return unsubscribe

    def _publish(self) -> None:
        # All callers hold the run lock, preserving emission sequence across workers.
        self._sequence += 1
        snapshot = self.snapshot()
        for callback in tuple(self._observers):
            observe(callback, snapshot)

    def _update(self, node_id: str, **updates) -> None:
        with self._lock:
            previous = self._operations[node_id]
            if previous.status in TERMINAL:
                raise ValueError("Cannot update a terminal operation")
            values = {**previous.model_dump(), **updates}
            completed, total = values["completed"], values["total"]
            if completed is not None and total is not None and completed > total:
                raise ValueError("Completed work cannot exceed total work")
            if total is not None and completed is not None:
                values["progress_fraction"] = completed / total if total else None
            status = values["status"]
            if status == "running":
                self._node_started.setdefault(node_id, perf_counter())
            if node_id in self._node_started:
                values["elapsed_seconds"] = max(0.0, perf_counter() - self._node_started[node_id])
            if status == "complete":
                values["progress_fraction"] = 1.0
                if total is not None:
                    values["completed"] = total
            if status == "blocked":
                values["blocked_by"] = tuple(parent for parent in previous.dependencies
                    if self._operations[parent].status in ("failed", "blocked"))
            self._operations[node_id] = OperationProgressSnapshot.model_validate(values)
            for key, operation in tuple(self._operations.items()):
                waiting = tuple(parent for parent in operation.dependencies
                    if self._operations[parent].status != "complete") if operation.status == "waiting" else ()
                self._operations[key] = operation.model_copy(update={"waiting_for": waiting})
            self._publish()

    def execute(self, handlers: Mapping[str, Callable[[dict, OperationContext], dict]], *, resource_capacity=None) -> RecordingExecutionResult:
        """Execute synchronously exactly once in the application's admitted job."""
        with self._lock:
            if self._executed:
                raise ValueError("A pipeline run can only execute once")
            self._executed = True
            self._started = perf_counter()
            self._status = "running"
            self._publish()
        try:
            result = execute_recording_graph(graph=self.graph, handlers=handlers,
                resource_capacity=resource_capacity, cancelled=self._cancel.is_set,
                on_operation=lambda node_id, status, detail: self._update(node_id, status=status, detail=detail),
                invoke_handler=lambda node_id, handler, inputs: handler(inputs, OperationContext(self, node_id)))
            with self._lock:
                self.result = result
                self._status = ("complete" if result.complete else "failed" if result.failures or result.blocked
                                else "cancelled" if result.cancelled else "failed")
                if result.failures:
                    self._error = "\n".join(f"{key}: {value}" for key, value in result.failures.items())
            return result
        except Exception as error:
            with self._lock:
                self._status = "failed"
                self._error = f"{type(error).__name__}: {error}"
                for node_id, operation in tuple(self._operations.items()):
                    if operation.status not in TERMINAL:
                        self._update(node_id, status="failed", detail=self._error)
            raise
        finally:
            with self._lock:
                self._finished = perf_counter()
                self._publish()

    def cancel(self) -> dict:
        with self._lock:
            if self._status in ("queued", "running") and not self._cancel.is_set():
                self._cancel.set()
                # Queued work still belongs to APP's admitted job and must drain
                # through execute; never release admission from an HTTP observer.
                self._publish()
            return self.snapshot()


class PipelineRegistry:
    def __init__(self):
        self._runs: dict[str, PipelineRun] = {}
        self._lock = RLock()
        self._observers: list[Callable] = []

    def _notify(self, snapshot):
        with self._lock:
            observers = tuple(self._observers)
        for callback in observers:
            observe(callback, snapshot)

    def add(self, run: PipelineRun) -> PipelineRun:
        # Register before execution. No run locks are acquired under registry lock.
        unsubscribe = run.subscribe(self._notify)
        try:
            with self._lock:
                if run.run_id in self._runs:
                    raise ValueError("Run identity is already registered")
                self._runs[run.run_id] = run
        except Exception:
            unsubscribe()
            raise
        self._notify(run.snapshot())
        return run

    def get(self, run_id: str) -> PipelineRun:
        with self._lock:
            return self._runs[run_id]

    def snapshot(self) -> dict:
        with self._lock:
            runs = tuple(self._runs.values())
        return {"tasks": [run.snapshot() for run in runs]}

    def subscribe(self, callback: Callable[[dict], None]) -> Callable[[], None]:
        with self._lock:
            self._observers.append(callback)
        # Subscribe first; consumers reject older sequences if these initial
        # snapshots race a new update. Terminal runs are included on reconnect.
        for snapshot in self.snapshot()["tasks"]:
            observe(callback, snapshot)
        def unsubscribe():
            with self._lock:
                if callback in self._observers:
                    self._observers.remove(callback)
        return unsubscribe

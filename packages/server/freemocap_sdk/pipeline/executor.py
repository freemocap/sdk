"""Core's bounded recording-level scheduler, with isolated observation and cancellation."""
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED, CancelledError
from dataclasses import dataclass, field
from time import perf_counter
import logging
import traceback

from .definition import CompiledGraph, InputBindingRule, DataGranularity

log = logging.getLogger(__name__)

@dataclass
class RecordingExecutionResult:
    outputs: dict[str, dict[str, object]] = field(default_factory=dict)
    failures: dict[str, str] = field(default_factory=dict)
    failure_tracebacks: dict[str, str] = field(default_factory=dict)
    blocked: dict[str, tuple[str, ...]] = field(default_factory=dict)
    cancelled_nodes: set[str] = field(default_factory=set)
    required_nodes: frozenset[str] = frozenset()
    elapsed_seconds: dict[str, float] = field(default_factory=dict)
    started_seconds: dict[str, float] = field(default_factory=dict)
    finished_seconds: dict[str, float] = field(default_factory=dict)
    cancelled: bool = False

    @property
    def complete(self) -> bool:
        # All validated outputs win over a cancellation arriving during a successful
        # publication commit. A cancelled/skipped/failed operation never does.
        return (bool(self.required_nodes) and self.required_nodes == self.outputs.keys()
                and not self.failures and not self.blocked and not self.cancelled_nodes)


def execute_recording_graph(*, graph: CompiledGraph,
    handlers: Mapping[str, Callable], resource_capacity: Mapping[str, int] | None = None,
    cancelled: Callable[[], bool] = lambda: False,
    on_operation: Callable[[str, str, str], None] = lambda _id, _status, _detail: None,
    invoke_handler: Callable = lambda _id, handler, inputs: handler(inputs),
) -> RecordingExecutionResult:
    """Run the existing resource-bounded ready-node algorithm and drain admitted work.

    APP owns the enclosing job thread. This scheduler owns only operation workers;
    handlers own payload validation and cooperative native-call cancellation.
    """
    capacities = dict(resource_capacity if resource_capacity is not None else
                      {"compute": 2, "annotation": 2, "recording_io": 1})
    nodes = {node.id: node for node in graph.definition.nodes}
    if any(node.operation not in handlers or node.execution_resource not in capacities for node in nodes.values()):
        raise ValueError("Every operation requires a registered handler and execution resource")
    if any(type(value) is not int or value < 1 for value in capacities.values()):
        raise ValueError("Execution capacity must be a positive integer")
    if any(port.contract.data_granularity != DataGranularity.RECORDING
           for node in nodes.values() for port in (*node.inputs, *node.outputs)) or any(
           edge.binding != InputBindingRule.SAME_KEY for edge in graph.definition.edges):
        raise ValueError("Recording executor requires recording-level same-key bindings")
    incoming = {node: [edge for edge in graph.definition.edges if edge.target.node == node] for node in nodes}
    result = RecordingExecutionResult(required_nodes=frozenset(nodes))
    execution_started = perf_counter()
    pending = set(nodes)
    running = {}
    pools = {name: ThreadPoolExecutor(max_workers=count, thread_name_prefix=f"graph-{name}")
             for name, count in capacities.items()}

    def notify(node_id, status, detail=""):
        try:
            on_operation(node_id, status, detail)
        except Exception:
            log.exception("Pipeline observer failed for %s", node_id)

    def invoke(node_id, inputs):
        start = perf_counter()
        result.started_seconds[node_id] = start - execution_started
        try:
            if cancelled():
                raise CancelledError("Recording execution cancelled")
            notify(node_id, "running")
            output = invoke_handler(node_id, handlers[nodes[node_id].operation], inputs)
            if not isinstance(output, dict) or set(output) != {port.name for port in nodes[node_id].outputs}:
                raise ValueError(f"Operation {node_id} returned undeclared/missing output ports")
            return output
        finally:
            result.elapsed_seconds[node_id] = perf_counter() - start
            result.finished_seconds[node_id] = perf_counter() - execution_started

    try:
        while pending or running:
            result.cancelled = result.cancelled or cancelled()
            for node_id in graph.topological_order:
                if node_id not in pending:
                    continue
                parents = {edge.source.node for edge in incoming[node_id]}
                failed = parents.intersection(result.failures.keys() | result.blocked.keys())
                cancelled_parents = parents.intersection(result.cancelled_nodes)
                if failed:
                    result.blocked[node_id] = tuple(sorted(failed))
                    pending.remove(node_id)
                    notify(node_id, "blocked", "Failed dependencies: " + ", ".join(sorted(failed)))
                elif result.cancelled or cancelled_parents:
                    result.cancelled_nodes.add(node_id)
                    pending.remove(node_id)
                    notify(node_id, "cancelled", "Cancelled before execution")
                elif parents.issubset(result.outputs):
                    resource = nodes[node_id].execution_resource
                    if sum(nodes[value].execution_resource == resource for value in running.values()) >= capacities[resource]:
                        continue
                    inputs = {edge.target.port: result.outputs[edge.source.node][edge.source.port] for edge in incoming[node_id]}
                    running[pools[resource].submit(invoke, node_id, inputs)] = node_id
                    pending.remove(node_id)
            if running:
                finished, _ = wait(running, return_when=FIRST_COMPLETED, timeout=0.1)
                for future in finished:
                    node_id = running.pop(future)
                    try:
                        result.outputs[node_id] = future.result()
                        notify(node_id, "complete")
                    except CancelledError as error:
                        result.cancelled = True
                        result.cancelled_nodes.add(node_id)
                        notify(node_id, "cancelled", str(error))
                    except Exception as error:
                        result.failures[node_id] = f"{type(error).__name__}: {error}"
                        result.failure_tracebacks[node_id] = traceback.format_exc()
                        notify(node_id, "failed", result.failures[node_id])
            elif pending:
                raise RuntimeError("Compiled graph has unresolved prerequisites")
    finally:
        for pool in pools.values():
            pool.shutdown(wait=True, cancel_futures=True)
    result.cancelled = result.cancelled or cancelled()
    return result

import asyncio
from concurrent.futures import CancelledError
from threading import Event, Thread

import cbor2
import pytest
from fastapi.testclient import TestClient

from freemocap_sdk.pipeline import (DataContract, DataGranularity, GraphPort, GraphNode,
    PortReference, GraphConnection, GraphDefinition, InputBindingRule, compile_graph,
    PipelineRun, PipelineRegistry, pipeline_router, stream_pipeline_snapshots)
from freemocap_sdk.server import create_app
from freemocap_sdk.stream import encode_message


def graph(ids=("bind", "publish")):
    port = GraphPort(name="value", contract=DataContract(kind="test", data_granularity=DataGranularity.RECORDING))
    return compile_graph(GraphDefinition(nodes=tuple(GraphNode(id=name, operation=name,
        inputs=(port,) if i else (), outputs=(port,)) for i, name in enumerate(ids)),
        edges=tuple(GraphConnection(source=PortReference(node=a, port="value"),
            target=PortReference(node=b, port="value"), binding=InputBindingRule.SAME_KEY)
            for a, b in zip(ids, ids[1:]))))


def test_compiler_rejects_missing_binding_semantic_mismatch_and_cycles():
    definition=graph().definition
    with pytest.raises(ValueError, match="Unbound"):
        compile_graph(definition.model_copy(update={"edges": ()}))
    target=definition.nodes[1]
    wrong=target.inputs[0].model_copy(update={"contract": target.inputs[0].contract.model_copy(update={"units":"mm"})})
    with pytest.raises(ValueError, match="semantics"):
        compile_graph(definition.model_copy(update={"nodes":(definition.nodes[0],target.model_copy(update={"inputs":(wrong,)}))}))
    source=definition.nodes[0].model_copy(update={"inputs": target.inputs})
    edge=GraphConnection(source=PortReference(node="publish",port="value"),target=PortReference(node="bind",port="value"),binding=InputBindingRule.SAME_KEY)
    with pytest.raises(ValueError, match="cycle"):
        compile_graph(definition.model_copy(update={"nodes":(source,target),"edges":(*definition.edges,edge)}))


def test_sync_execution_observer_isolation_and_output_validation():
    snapshots=[]
    def broken(snapshot):
        snapshot["operations"].clear()
        raise RuntimeError("observer is unavailable")
    run=PipelineRun(graph(),on_snapshot=broken)
    run.subscribe(snapshots.append)
    def publish(inputs,ctx):
        ctx.check_cancelled();ctx.progress(2,2,"moments");ctx.artifacts(reads=("input",),writes=("result",))
        return {"value": inputs["value"]+1}
    result=run.execute({"bind":lambda inputs,ctx:{"value":2},"publish":publish})
    assert result.complete and result.outputs["publish"]["value"]==3
    assert run.snapshot()["status"]=="complete"
    assert all(len(snapshot["operations"])==2 for snapshot in snapshots)
    assert [s["sequence"] for s in snapshots]==sorted(set(s["sequence"] for s in snapshots))
    assert run.snapshot()["operations"][1]["files_written"]==["result"]
    with pytest.raises(ValueError,match="once"):
        run.execute({})
    bad=PipelineRun(graph())
    result=bad.execute({"bind":lambda inputs,ctx:{"wrong":2},"publish":publish})
    assert not result.complete and result.blocked["publish"]==("bind",)
    states={o["operation_id"]:o for o in bad.snapshot()["operations"]}
    assert states["publish"]["status"]=="blocked" and states["publish"]["blocked_by"]==["bind"]


def test_cancel_waits_for_active_handler_to_drain():
    entered,release=Event(),Event()
    run=PipelineRun(graph())
    def bind(inputs,ctx):
        entered.set();assert release.wait(5);ctx.check_cancelled()
        return {"value":1}
    thread=Thread(target=lambda:run.execute({"bind":bind,"publish":lambda inputs,ctx:inputs}))
    thread.start()
    try:
        assert entered.wait(5)
        snapshot=run.cancel()
        assert snapshot["status"]=="running" and snapshot["cancel_requested"]
        assert thread.is_alive()
    finally:
        release.set();thread.join(5)
    assert not thread.is_alive()
    assert run.snapshot()["status"]=="cancelled"
    assert {o["status"] for o in run.snapshot()["operations"]}=={"cancelled"}
    assert not run.result.failures


def test_queued_cancel_runs_no_handlers_and_invalid_capacity_is_terminal_failure():
    run=PipelineRun(graph());run.cancel()
    def unexpected(*args):raise AssertionError("must not execute")
    result=run.execute({"bind":unexpected,"publish":unexpected})
    assert result.cancelled and not result.outputs and run.snapshot()["status"]=="cancelled"
    invalid=PipelineRun(graph())
    with pytest.raises(ValueError,match="capacity"):
        invalid.execute({"bind":unexpected,"publish":unexpected},resource_capacity={"compute":0})
    assert invalid.snapshot()["status"]=="failed"
    assert all(o["status"]=="failed" for o in invalid.snapshot()["operations"])


def test_successful_commit_wins_late_cancel_but_publication_failure_does_not():
    for fail in (False,True):
        run=PipelineRun(graph())
        def publish(inputs,ctx):
            ctx.check_cancelled()
            # Simulate cancellation after the publication boundary began.
            run.cancel()
            ctx.artifacts(writes=("published-manifest",))
            ctx.progress(1,1,"artifacts")
            if fail:raise OSError("pointer replacement failed")
            return {"value":"published-manifest"}
        result=run.execute({"bind":lambda inputs,ctx:{"value":1},"publish":publish})
        assert run.snapshot()["cancel_requested"]
        assert run.snapshot()["status"]==("failed" if fail else "complete")
        assert result.complete is (not fail)


def test_http_inspection_and_cancel_never_schedule_execution():
    registry=PipelineRegistry();run=registry.add(PipelineRun(graph()))
    with TestClient(create_app(title="pipeline",routers=[pipeline_router(registry,prefix="/tasks")])) as client:
        assert client.get("/tasks").json()["tasks"][0]["run_id"]==run.run_id
        assert client.get("/tasks/missing").status_code==404
        assert client.post(f"/tasks/{run.run_id}/cancel").json()["cancel_requested"]
        assert run.result is None


def test_stream_coalesces_per_run_preserves_terminals_and_reconnects():
    async def scenario():
        registry=PipelineRegistry()
        entered=asyncio.Event();release=asyncio.Event();messages=[]
        class SlowConnection:
            async def send_message(self,kind,payload,**envelope):
                # Exercise the real encoder, including reserved envelope keys/nulls.
                message=cbor2.loads(encode_message(kind,payload,**envelope))
                messages.append(message);entered.set();await release.wait()
        task=asyncio.create_task(stream_pipeline_snapshots(SlowConnection(),registry))
        await asyncio.sleep(0)
        runs=[]
        for _ in range(2):
            run=registry.add(PipelineRun(graph(("project",))))
            runs.append(run)
            def handler(inputs,ctx):
                for i in range(200):ctx.progress(i,200,"moments")
                return {"value":"artifact"}
            await asyncio.to_thread(run.execute,{"project":handler})
        await asyncio.wait_for(entered.wait(),5)
        release.set()
        for _ in range(100):
            if len({m["snapshot"]["run_id"] for m in messages if m["snapshot"]["status"]=="complete"})==2:break
            await asyncio.sleep(.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
        assert len(messages)<=4
        assert len({m["snapshot"]["run_id"] for m in messages if m["snapshot"]["status"]=="complete"})==2
        for message in messages:
            assert message["snapshot"]["error"] is None
            assert message["sequence"]==message["snapshot"]["sequence"]
        messages.clear()
        reconnect=asyncio.create_task(stream_pipeline_snapshots(SlowConnection(),registry))
        for _ in range(100):
            if len(messages)==2:break
            await asyncio.sleep(.01)
        reconnect.cancel()
        with pytest.raises(asyncio.CancelledError):await reconnect
        assert {m["snapshot"]["run_id"] for m in messages}=={r.run_id for r in runs}
        assert all(m["snapshot"]["status"]=="complete" for m in messages)
    asyncio.run(scenario())

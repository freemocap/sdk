"""Retained GET/cancel endpoints; application-owned preview/start routes inject recipes."""
from fastapi import APIRouter, HTTPException
from .runtime import PipelineRegistry


def pipeline_router(registry: PipelineRegistry, *, prefix: str = "/tasks") -> APIRouter:
    router = APIRouter(prefix=prefix, tags=["Pipeline tasks"])
    def find(run_id: str):
        try:
            return registry.get(run_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Unknown pipeline run") from None
    @router.get("")
    def tasks():
        return registry.snapshot()
    @router.get("/{run_id}")
    def task(run_id: str):
        return find(run_id).snapshot()
    @router.post("/{run_id}/cancel")
    def cancel(run_id: str):
        return find(run_id).cancel()
    return router

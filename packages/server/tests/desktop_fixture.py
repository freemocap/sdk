from contextlib import asynccontextmanager
from pathlib import Path
import sys

from fastapi import APIRouter
from freemocap_sdk.desktop import run_desktop_server
from freemocap_sdk.server import create_app

marker = Path(sys.argv[1])

@asynccontextmanager
async def lifespan(app):
    marker.write_text("started")
    yield
    marker.write_text("stopped")

router = APIRouter()
@router.get("/status")
def status():
    return {"ready": True}

if __name__ == "__main__":
    run_desktop_server(create_app(title="Desktop fixture", routers=[router], lifespan=lifespan))

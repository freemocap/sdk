"""Owned desktop backend: announce readiness and stop when its parent releases stdin."""
from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
import threading

from fastapi import FastAPI
import uvicorn


def run_desktop_server(app: FastAPI, *, port: int = 0) -> None:
    """Serve loopback HTTP/WS until the desktop parent sends shutdown or closes stdin.

    The ready line is emitted only after ASGI lifespan startup and socket binding.
    An ephemeral port avoids attaching to or terminating another application's server.
    """
    async def serve() -> None:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(("127.0.0.1", port))
        listener.listen(128)
        listener.setblocking(False)
        actual_port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=actual_port,
                                               log_level="info", timeout_graceful_shutdown=5))
        loop = asyncio.get_running_loop()

        def receive_control() -> None:
            try:
                for line in sys.stdin:
                    try:
                        command = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if command == {"command": "shutdown"}:
                        break
            finally:
                if not loop.is_closed():
                    loop.call_soon_threadsafe(setattr, server, "should_exit", True)

        threading.Thread(target=receive_control, daemon=True, name="DesktopParentControl").start()
        task = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            while not server.started and not task.done():
                await asyncio.sleep(0.01)
            if server.started and not server.should_exit:
                print(json.dumps({"event": "freemocap_ready", "url": f"http://127.0.0.1:{actual_port}",
                                  "pid": os.getpid()}), flush=True)
            await task
        finally:
            listener.close()

    asyncio.run(serve())

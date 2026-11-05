from queue import Queue
from threading import Thread
import json
from pathlib import Path
import socket
import subprocess
import sys
from urllib.request import urlopen
from urllib.parse import urlparse

import pytest


@pytest.mark.parametrize("explicit_shutdown", [True, False])
def test_owned_backend_readiness_and_shutdown(tmp_path, explicit_shutdown):
    marker = tmp_path / "lifecycle.txt"
    child = subprocess.Popen([sys.executable, str(Path(__file__).with_name("desktop_fixture.py")), str(marker)],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                             creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    try:
        lines = Queue()
        Thread(target=lambda: lines.put(child.stdout.readline()), daemon=True).start()
        ready = json.loads(lines.get(timeout=15))
        assert ready["event"] == "freemocap_ready"
        # Windows virtualenv python.exe can delegate to a second interpreter process.
        assert ready["pid"] > 0
        assert marker.read_text() == "started"
        assert json.load(urlopen(ready["url"] + "/status", timeout=5)) == {"ready": True}
        if explicit_shutdown:
            child.stdin.write('{"command":"shutdown"}\n')
            child.stdin.flush()
        child.stdin.close()
        assert child.wait(timeout=10) == 0, child.stderr.read()
        assert marker.read_text() == "stopped"
        with socket.socket() as probe:
            assert probe.connect_ex(("127.0.0.1", urlparse(ready["url"]).port)) != 0
    finally:
        if child.stdin and not child.stdin.closed:
            child.stdin.close()
        if child.poll() is None:
            child.kill()
            child.wait()

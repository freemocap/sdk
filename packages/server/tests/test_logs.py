import asyncio
import logging
from queue import Empty
import sys

from freemocap_sdk.logs import LogHub


def record(message, level=logging.INFO):
    return logging.LogRecord("app.test", level, __file__, 12, message, (), None, "operation")


def test_broadcast_history_and_bounded_slow_client():
    hub = LogHub(capacity=2)
    hub.handle(record("startup"))
    with hub.subscribe() as slow, hub.subscribe() as fast:
        assert slow.get_nowait()["message"] == fast.get_nowait()["message"] == "startup"
        for number in range(4):
            hub.handle(record(str(number)))
            assert fast.get_nowait()["message"] == str(number)
        assert [slow.get_nowait()["message"], slow.get_nowait()["message"]] == ["2", "3"]
        assert hub.dropped == 2
    assert not hub._subscribers
    with hub.subscribe() as reconnect:
        assert [reconnect.get_nowait()["message"], reconnect.get_nowait()["message"]] == ["2", "3"]


def test_formatted_exception_and_unique_identity():
    hub = LogHub(max_text=2000)
    try:
        raise ValueError("diagnostic detail")
    except ValueError:
        item = logging.LogRecord("app.test", logging.ERROR, __file__, 30, "failed %s", ("operation",), sys.exc_info())
        hub.handle(item)
        hub.handle(item)
    with hub.subscribe() as queue:
        first, second = queue.get_nowait(), queue.get_nowait()
    assert first["message"].startswith("failed operation\nTraceback")
    assert "ValueError: diagnostic detail" in first["exc_text"]
    assert first["log_id"] != second["log_id"]
    assert first["args"] == []
    assert first["asctime"].endswith("+00:00")


def test_forward_existing_envelope_and_cancel_cleanup():
    async def run():
        hub = LogHub()
        hub.handle(record("live event"))
        received = []
        class Connection:
            async def send_message(self, kind, payload, **envelope):
                received.append((kind, payload, envelope))
        task = asyncio.create_task(hub.forward(Connection()))
        for _ in range(20):
            if received:
                break
            await asyncio.sleep(.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert not hub._subscribers
        assert received[0][0] == "log"
        assert received[0][1]["record"]["message"] == "live event"
        assert received[0][2]["sequence"] == 0
    asyncio.run(run())


def test_record_size_bounded_and_console_record_unchanged():
    hub = LogHub(max_text=20)
    item = record("x" * 100)
    hub.handle(item)
    with hub.subscribe() as queue:
        saved = queue.get_nowait()
    assert saved["message"] == "x" * 20 + "\n[truncated]"
    assert item.getMessage() == "x" * 100


def test_session_identity_is_stable_for_reconnect_and_new_for_new_hub():
    hub = LogHub()
    session = hub.session_id
    hub.handle(record("startup"))
    for _ in range(2):
        with hub.subscribe() as queue:
            assert queue.get_nowait()["log_id"].startswith(session + ":")
        assert hub.session_id == session
    assert LogHub().session_id != session

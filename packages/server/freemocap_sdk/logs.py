"""Bounded broadcast of standard logging records over the existing log transport.

Application owns attachment, levels and worker-process logging configuration.
Each connection receives its own latest-history queue; slow clients cannot block
other clients or application logging. Console/file handlers remain untouched.
"""
from __future__ import annotations

import asyncio
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
import logging
from queue import Empty, Full, Queue
from threading import RLock
from uuid import uuid4

from freemocap_sdk.server import Connection


class LogHub(logging.Handler):
    def __init__(self, *, capacity: int = 1000, max_text: int = 32768):
        super().__init__()
        if capacity < 1 or max_text < 1:
            raise ValueError("Log bounds must be positive")
        self.capacity, self.max_text = capacity, max_text
        self._history = deque(maxlen=capacity)
        self._subscribers: set[Queue] = set()
        self._guard = RLock()
        self._session = uuid4().hex
        self._sequence = 0
        self.dropped = 0

    @property
    def session_id(self) -> str:
        """Stable for this hub's lifetime, including client reloads/reconnections."""
        return self._session

    def emit(self, record: logging.LogRecord) -> None:
        try:
            text = record.getMessage()
            exception = logging.Formatter().formatException(record.exc_info) if record.exc_info else record.exc_text
            if exception:
                text += "\n" + exception
            def bound(value):
                if value is None:
                    return None
                value = str(value)
                return value if len(value) <= self.max_text else value[:self.max_text] + "\n[truncated]"
            message = bound(text)
            timestamp = datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds")
            data = dict(name=record.name, msg=message, args=[], levelname=record.levelname, levelno=record.levelno,
                        pathname=record.pathname, filename=record.filename, module=record.module,
                        exc_info=None, exc_text=bound(exception), stack_info=bound(record.stack_info),
                        lineno=record.lineno, funcName=record.funcName or "", created=record.created,
                        msecs=record.msecs, relativeCreated=record.relativeCreated, thread=record.thread or 0,
                        threadName=record.threadName or "", processName=record.processName or "", process=record.process or 0,
                        delta_t=f"{record.relativeCreated / 1000:.3f}s", message=message, asctime=timestamp,
                        formatted_message=f"[{timestamp}] [{record.levelname}] {record.name}: {message}",
                        type="log_record", source="server")
            with self._guard:
                self._sequence += 1
                data["log_id"] = f"{self._session}:{self._sequence}"
                self._history.append(data)
                for queue in self._subscribers:
                    try:
                        queue.put_nowait(data)
                    except Full:
                        try:
                            queue.get_nowait()
                        except Empty:
                            pass
                        queue.put_nowait(data)
                        self.dropped += 1
        except Exception:
            self.handleError(record)

    @contextmanager
    def subscribe(self):
        queue = Queue(maxsize=self.capacity)
        with self._guard:
            for record in self._history:
                queue.put_nowait(record)
            self._subscribers.add(queue)
        try:
            yield queue
        finally:
            with self._guard:
                self._subscribers.discard(queue)

    async def forward(self, connection: Connection) -> None:
        """Run alongside application's receive loop; cancel and await on disconnect."""
        with self.subscribe() as queue:
            sequence = 0
            while True:
                try:
                    record = queue.get_nowait()
                except Empty:
                    await asyncio.sleep(.05)
                    continue
                await connection.send_message("log", {"record": record}, timestamp=record["created"], sequence=sequence)
                sequence += 1
                # Explicit yield prevents bursts starving receive/heartbeat tasks.
                await asyncio.sleep(0)

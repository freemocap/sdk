# Live application logs

`freemocap_sdk.logs.LogHub` is a standard `logging.Handler`. The application attaches it to its selected loggers in its lifespan, sets its own levels, removes it on shutdown and calls `close()`. Existing console/file handlers remain unchanged. Avoid attaching twice to both a logger and its propagating ancestor. Capture worker-process logs through the application's existing process-safe logging path; this handler does not create or replace an IPC queue.

Run `hub.forward(connection)` alongside the application's receive loop. When either task finishes, cancel and await the other task so disconnection releases the subscriber. The existing SDK connection serializes writes and responds to heartbeats. The hub sends the existing `log` envelope, consumed by `TransportService.subscribeToLog`.

History and each subscriber queue are bounded to 1,000 records by default. Slow clients lose their oldest relay copies without blocking producers or other subscribers. Each record's text is bounded; truncation is explicit. New connections receive the retained history. Stable `log_id` values permit frontend deduplication on reconnect. This is best-effort UI delivery, not a durable log archive. Formatting retains exception details and does not mutate the original `LogRecord` used by other handlers.

```python
hub = LogHub(capacity=1000)
# In application lifespan: attach to chosen logger(s), then remove on exit.
# In websocket handler: supervise this alongside the existing receive task.
forwarder = asyncio.create_task(hub.forward(connection))
```

The app must supervise and clean up tasks; it must not leave the forwarder alive after disconnect.

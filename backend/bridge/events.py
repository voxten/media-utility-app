"""Python → JavaScript event delivery.

Workers call :meth:`EventBus.emit` from any thread. A single dispatcher thread drains
the queue and delivers events in batches with one ``run_js`` call
(``window.__bridge.emitBatch([...])``), so slow WebView round-trips never block jobs.
Events emitted before the page is ready are buffered.
"""

import json
import queue
import threading
from typing import Any, Dict, List, Optional

BATCH_WINDOW_S = 0.03
MAX_BATCH = 200


class EventBus:
    def __init__(self) -> None:
        self._queue: "queue.Queue[Optional[Dict[str, Any]]]" = queue.Queue()
        self._window = None
        self._ready = threading.Event()
        self._thread = threading.Thread(target=self._dispatch, name="event-bus", daemon=True)
        self._thread.start()

    def attach(self, window: Any) -> None:
        self._window = window

    def detach(self) -> None:
        """Stop delivering (window closing); avoids calls into a disposed WebView."""
        self._window = None

    def mark_ready(self) -> None:
        """Called by the frontend once ``window.__bridge`` exists."""
        self._ready.set()

    def emit(self, event: str, payload: Dict[str, Any]) -> None:
        self._queue.put({"event": event, "payload": payload})

    def close(self) -> None:
        self._queue.put(None)

    def _dispatch(self) -> None:
        while True:
            first = self._queue.get()
            if first is None:
                return
            batch: List[Dict[str, Any]] = [first]
            self._ready.wait()
            # Collect whatever arrives within a short window into one JS call.
            try:
                while len(batch) < MAX_BATCH:
                    item = self._queue.get(timeout=BATCH_WINDOW_S)
                    if item is None:
                        self._send(batch)
                        return
                    batch.append(item)
            except queue.Empty:
                pass
            self._send(batch)

    def _send(self, batch: List[Dict[str, Any]]) -> None:
        if self._window is None:
            return
        data = json.dumps(batch, ensure_ascii=False, default=str)
        try:
            self._window.run_js(f"window.__bridge && window.__bridge.emitBatch({data});")
        except Exception as exc:  # noqa: BLE001 - window may be closing
            print(f"[event-bus] delivery failed: {exc}")

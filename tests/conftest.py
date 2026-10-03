import threading
from typing import Any, Dict, List, Tuple

import pytest

from backend.core.jobs import JobContext


class RecordingContext(JobContext):
    """JobContext that keeps every emitted event for assertions."""

    def __init__(self) -> None:
        self.events: List[Tuple[str, Dict[str, Any]]] = []
        self._events_lock = threading.Lock()
        super().__init__("test", self._record)

    def _record(self, event: str, payload: Dict[str, Any]) -> None:
        with self._events_lock:
            self.events.append((event, payload))

    def of(self, event: str) -> List[Dict[str, Any]]:
        return [payload for name, payload in self.events if name == event]


@pytest.fixture
def ctx() -> RecordingContext:
    return RecordingContext()

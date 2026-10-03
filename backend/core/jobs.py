"""Background job execution shared by every tool.

A service function receives a :class:`JobContext` and reports through it instead of
Qt signals. The :class:`JobManager` runs it on a thread pool and forwards everything
to a single ``emit(event, payload)`` callback (the UI bridge).

Events: ``job:started``, ``job:progress``, ``job:log``, ``job:partial``,
``job:done``, ``job:error``, ``job:cancelled``.
"""

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

Emit = Callable[[str, Dict[str, Any]], None]

PROGRESS_INTERVAL_S = 0.1


class JobCancelled(Exception):
    """Raised inside a service when the user cancelled the job."""


class JobContext:
    """Reporting handle passed to service functions."""

    def __init__(self, job_id: str = "local", emit: Optional[Emit] = None) -> None:
        self.job_id = job_id
        self._emit = emit or (lambda event, payload: None)
        self._cancel = threading.Event()
        self._last_progress = 0.0
        self.percent: Optional[float] = None
        self.message: Optional[str] = None
        self.params: Dict[str, Any] = {}

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set()

    def cancel(self) -> None:
        self._cancel.set()

    def check_cancelled(self) -> None:
        if self._cancel.is_set():
            raise JobCancelled()

    def progress(
        self,
        percent: Optional[float] = None,
        message: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        **extra: Any,
    ) -> None:
        """Report progress (0-100, or None for indeterminate). Throttled to ~10 events/s.

        ``message`` is an i18n key (e.g. ``"converter.status.converting"``) and ``params``
        its interpolation values, so the UI can render it in the user's language.
        """
        params = params or {}
        # A new message key always goes out; per-item param changes (file names) are throttled.
        changed_message = message is not None and message != self.message
        if percent is not None:
            self.percent = max(0.0, min(100.0, float(percent)))
        if message is not None:
            self.message = message
            self.params = params

        now = time.monotonic()
        final = self.percent is not None and self.percent >= 100
        if not (changed_message or final) and now - self._last_progress < PROGRESS_INTERVAL_S:
            return
        self._last_progress = now
        self._send(
            "job:progress",
            {"percent": self.percent, "message": self.message, "params": self.params, **extra},
        )

    def log(self, message: str, level: str = "info", **params: Any) -> None:
        """Append a log line; ``message`` is an i18n key, ``params`` its values."""
        self._send(
            "job:log",
            {"message": message, "params": params, "level": level, "time": time.time()},
        )

    def partial(self, data: Any) -> None:
        """Stream an intermediate result (e.g. one rendered PDF page) to the UI."""
        self._send("job:partial", {"data": data})

    def _send(self, event: str, payload: Dict[str, Any]) -> None:
        self._emit(event, {"jobId": self.job_id, **payload})


@dataclass
class JobInfo:
    id: str
    kind: str
    title: str
    status: str = "running"  # running | done | error | cancelled
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    error: Optional[str] = None
    context: Optional[JobContext] = None

    def to_dict(self) -> Dict[str, Any]:
        ctx = self.context
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "status": self.status,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "error": self.error,
            "percent": ctx.percent if ctx else None,
            "message": ctx.message if ctx else None,
            "params": ctx.params if ctx else {},
        }


class JobManager:
    def __init__(self, emit: Optional[Emit] = None, max_workers: int = 4) -> None:
        self._emit = emit or (lambda event, payload: None)
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="job")
        self._jobs: Dict[str, JobInfo] = {}
        self._lock = threading.Lock()

    def submit(self, kind: str, fn: Callable[[JobContext], Any], title: str = "") -> str:
        job_id = uuid.uuid4().hex[:12]
        ctx = JobContext(job_id, self._emit)
        info = JobInfo(id=job_id, kind=kind, title=title or kind, context=ctx)
        with self._lock:
            self._jobs[job_id] = info
        self._emit("job:started", info.to_dict())
        self._pool.submit(self._run, info, fn)
        return job_id

    def _run(self, info: JobInfo, fn: Callable[[JobContext], Any]) -> None:
        ctx = info.context
        assert ctx is not None
        try:
            result = fn(ctx)
        except JobCancelled:
            self._finish(info, "cancelled")
            self._emit("job:cancelled", {"jobId": info.id})
        except Exception as exc:  # noqa: BLE001 - every failure must reach the UI
            traceback.print_exc()
            if ctx.cancelled:
                self._finish(info, "cancelled")
                self._emit("job:cancelled", {"jobId": info.id})
            else:
                self._finish(info, "error", str(exc))
                self._emit("job:error", {"jobId": info.id, "error": str(exc)})
        else:
            if ctx.cancelled:
                self._finish(info, "cancelled")
                self._emit("job:cancelled", {"jobId": info.id})
            else:
                self._finish(info, "done")
                self._emit("job:done", {"jobId": info.id, "result": result})

    def _finish(self, info: JobInfo, status: str, error: Optional[str] = None) -> None:
        with self._lock:
            info.status = status
            info.error = error
            info.finished_at = time.time()

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            info = self._jobs.get(job_id)
        if not info or info.status != "running" or not info.context:
            return False
        info.context.cancel()
        return True

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            info = self._jobs.get(job_id)
            return info.to_dict() if info else None

    def list(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [info.to_dict() for info in self._jobs.values()]

    def shutdown(self, wait: bool = False) -> None:
        with self._lock:
            for info in self._jobs.values():
                if info.context:
                    info.context.cancel()
        self._pool.shutdown(wait=wait, cancel_futures=True)

"""Background job execution shared by every tool.

A service function receives a :class:`JobContext` and reports through it instead of
Qt signals. The :class:`JobManager` runs it on a thread pool and forwards everything
to a single ``emit(event, payload)`` callback (the UI bridge).

Events: ``job:started``, ``job:progress``, ``job:log``, ``job:partial``,
``job:meta``, ``job:done``, ``job:error``, ``job:cancelled``; ``jobs:history`` once a finished job is saved.
"""

import logging
import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

from backend.core.errors import describe
from backend.core.history import JobHistory

Emit = Callable[[str, Dict[str, Any]], None]

PROGRESS_INTERVAL_S = 0.1
# Highest ``maxConcurrency``. The pool has spare threads on top, so quick lookups (link checks, PDF
# inspection) start at once even when every slot is busy.
MAX_LIMIT = 16
POOL_SIZE = MAX_LIMIT + 8

logger = logging.getLogger(__name__)
# Finished jobs kept for get()/list()/retry(); older ones live on only in the saved history.
MAX_FINISHED_JOBS = 100


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
        self.meta: Dict[str, Any] = {}

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

    def describe(self, **fields: Any) -> None:
        """Describe what the job works on (thumbnail, resolution, format…); merged and kept until it finishes."""
        fields = {k: v for k, v in fields.items() if v is not None}
        if not fields:
            return
        self.meta.update(fields)
        self._send("job:meta", {"meta": fields})

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
    # Kept while the job can still be run again with the same settings (until it finishes without an error).
    fn: Optional[Callable[[JobContext], Any]] = None
    # Limited jobs wait for a free slot; quick lookups (probes, PDF inspection) skip the queue.
    limited: bool = True

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
            "meta": ctx.meta if ctx else {},
            "retryable": self.fn is not None,
        }


class JobManager:
    def __init__(self, emit: Optional[Emit] = None, max_workers: int = 4, history: Optional[JobHistory] = None) -> None:
        self._emit = emit or (lambda event, payload: None)
        self._history = history
        self._pool = ThreadPoolExecutor(max_workers=POOL_SIZE, thread_name_prefix="job")
        self._jobs: Dict[str, JobInfo] = {}
        self._lock = threading.Lock()
        # Limited jobs wait here, not in the pool: a waiting job holds no thread.
        self._slots = threading.Lock()
        self._queue: Deque[Tuple[JobInfo, Callable[[JobContext], Any]]] = deque()
        self._limit = 1
        self._busy = 0
        self._running = 0
        self._runs = threading.Condition()
        self.set_limit(max_workers)

    @property
    def limit(self) -> int:
        return self._limit

    def set_limit(self, limit: Any) -> None:
        """How many limited jobs run at once; queued jobs start as soon as a slot frees up."""
        try:
            value = int(limit)
        except (TypeError, ValueError):
            return
        with self._slots:
            self._limit = max(1, min(MAX_LIMIT, value))
        self._start_queued()

    def submit(
        self,
        kind: str,
        fn: Callable[[JobContext], Any],
        title: str = "",
        retryable: bool = True,
        limited: bool = True,
    ) -> str:
        """Start ``fn`` in the background. ``retryable`` jobs that fail can be run again with :meth:`retry`.

        ``limited`` jobs share the ``maxConcurrency`` slots; pass False for quick lookups the UI waits on.
        """
        job_id = uuid.uuid4().hex[:12]
        ctx = JobContext(job_id, self._emit)
        info = JobInfo(
            id=job_id, kind=kind, title=title or kind, context=ctx, fn=fn if retryable else None, limited=limited
        )
        with self._lock:
            self._jobs[job_id] = info
        self._emit("job:started", info.to_dict())
        if not limited:
            self._pool.submit(self._run, info, fn)
            return job_id
        with self._slots:
            free = self._busy < self._limit and not self._queue
            if free:
                self._busy += 1
            else:
                ctx.progress(None, "jobs.pending")
                self._queue.append((info, fn))
        if free:
            self._pool.submit(self._run, info, fn)
        return job_id

    def _start_queued(self) -> None:
        """Hand queued jobs to the pool while slots are free."""
        while True:
            with self._slots:
                if self._busy >= self._limit or not self._queue:
                    return
                info, fn = self._queue.popleft()
                self._busy += 1
            ctx = info.context
            assert ctx is not None
            ctx.message, ctx.params = None, {}
            ctx._send("job:progress", {"percent": None, "message": None, "params": {}})
            self._pool.submit(self._run, info, fn)

    def _release(self) -> None:
        with self._slots:
            self._busy -= 1
        self._start_queued()

    def _run(self, info: JobInfo, fn: Callable[[JobContext], Any]) -> None:
        ctx = info.context
        assert ctx is not None
        result: Any = None
        with self._runs:
            self._running += 1
        try:
            ctx.check_cancelled()
            result = fn(ctx)
        except JobCancelled:
            self._finish(info, "cancelled")
            self._emit("job:cancelled", {"jobId": info.id})
        except Exception as exc:  # noqa: BLE001 - every failure must reach the UI
            logger.exception("Job %s (%s) failed", info.id, info.kind)
            if ctx.cancelled:
                self._finish(info, "cancelled")
                self._emit("job:cancelled", {"jobId": info.id})
            else:
                message = describe(exc)
                self._finish(info, "error", message)
                self._emit("job:error", {"jobId": info.id, "error": message})
        else:
            if ctx.cancelled:
                self._finish(info, "cancelled")
                self._emit("job:cancelled", {"jobId": info.id})
            else:
                self._finish(info, "done")
                self._emit("job:done", {"jobId": info.id, "result": result})
        finally:
            if info.limited:
                self._release()
            self._record(info, result if info.status == "done" else None)
            with self._runs:
                self._running -= 1
                self._runs.notify_all()

    def _record(self, info: JobInfo, result: Any) -> None:
        if self._history is None:
            return
        try:
            entry = self._history.record(info.to_dict(), result)
        except Exception:  # noqa: BLE001 - history must never break a finished job
            logger.exception("Could not save job %s to the history", info.id)
            return
        if entry is not None:
            self._emit("jobs:history", entry)

    def _finish(self, info: JobInfo, status: str, error: Optional[str] = None) -> None:
        with self._lock:
            info.status = status
            info.error = error
            info.finished_at = time.time()
            if status != "error":
                info.fn = None
            self._prune()
        logger.info("Job %s (%s) %s after %.1f s", info.id, info.kind, status, info.finished_at - info.started_at)

    def _prune(self) -> None:
        """Forget the oldest finished jobs beyond MAX_FINISHED_JOBS (caller holds the lock)."""
        finished = [job for job in self._jobs.values() if job.status != "running"]
        excess = len(finished) - MAX_FINISHED_JOBS
        if excess <= 0:
            return
        for job in sorted(finished, key=lambda job: job.finished_at or 0)[:excess]:
            del self._jobs[job.id]

    def retry(self, job_id: str) -> Optional[str]:
        """Run a failed job again with the same settings; the new job's id, or None when it cannot be retried."""
        with self._lock:
            info = self._jobs.get(job_id)
            if not info or info.status != "error" or info.fn is None:
                return None
            fn, info.fn = info.fn, None
        return self.submit(info.kind, fn, info.title, limited=info.limited)

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            info = self._jobs.get(job_id)
        if not info or info.status != "running" or not info.context:
            return False
        info.context.cancel()
        with self._slots:
            queued = next((entry for entry in self._queue if entry[0] is info), None)
            if queued:
                self._queue.remove(queued)
        if queued:
            self._finish(info, "cancelled")
            self._emit("job:cancelled", {"jobId": info.id})
            self._record(info, None)
        return True

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            info = self._jobs.get(job_id)
            return info.to_dict() if info else None

    def active_count(self) -> int:
        with self._lock:
            return sum(1 for info in self._jobs.values() if info.status == "running")

    def list(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [info.to_dict() for info in self._jobs.values()]

    def shutdown(self, wait: bool = False, timeout: float = 0.0) -> bool:
        """Cancels every job; ``wait`` blocks until all have stopped, ``timeout`` waits at most that long.

        True when no job is still running.
        """
        with self._slots:
            self._queue.clear()
        with self._lock:
            for info in self._jobs.values():
                if info.context:
                    info.context.cancel()
        self._pool.shutdown(wait=wait, cancel_futures=True)
        with self._runs:
            return self._runs.wait_for(lambda: self._running == 0, timeout=timeout)

import threading
import time

import pytest

from backend.core.jobs import JobCancelled, JobContext, JobManager


class Collector:
    def __init__(self):
        self.events = []
        self.finished = threading.Event()

    def __call__(self, event, payload):
        self.events.append((event, payload))
        if event in ("job:done", "job:error", "job:cancelled"):
            self.finished.set()

    def names(self):
        return [e for e, _ in self.events]


def test_job_reports_progress_and_result():
    sink = Collector()
    manager = JobManager(sink)

    def work(ctx):
        ctx.progress(50, "half")
        ctx.log("hello", "info", n=1)
        return {"answer": 42}

    job_id = manager.submit("test", work)
    assert sink.finished.wait(5)
    names = sink.names()
    assert names[0] == "job:started"
    assert "job:progress" in names and "job:log" in names
    done = [p for e, p in sink.events if e == "job:done"][0]
    assert done == {"jobId": job_id, "result": {"answer": 42}}
    assert manager.get(job_id)["status"] == "done"
    manager.shutdown()


def test_job_error_is_reported():
    sink = Collector()
    manager = JobManager(sink)

    def work(ctx):
        raise ValueError("boom")

    job_id = manager.submit("test", work)
    assert sink.finished.wait(5)
    error = [p for e, p in sink.events if e == "job:error"][0]
    assert error["error"] == "boom"
    assert manager.get(job_id)["status"] == "error"
    manager.shutdown()


def test_job_can_be_cancelled():
    sink = Collector()
    manager = JobManager(sink)
    started = threading.Event()

    def work(ctx):
        started.set()
        while True:
            ctx.check_cancelled()
            time.sleep(0.01)

    job_id = manager.submit("test", work)
    assert started.wait(5)
    assert manager.cancel(job_id)
    assert sink.finished.wait(5)
    assert "job:cancelled" in sink.names()
    assert manager.get(job_id)["status"] == "cancelled"
    assert not manager.cancel(job_id)
    manager.shutdown()


def test_progress_is_throttled_but_keeps_final_and_message_changes():
    events = []
    ctx = JobContext("x", lambda e, p: events.append(p))
    for i in range(100):
        ctx.progress(i, "same")
    ctx.progress(None, "other")
    ctx.progress(100)
    percents = [p["percent"] for p in events]
    assert len(events) < 20
    assert events[-1]["percent"] == 100
    assert any(p["message"] == "other" for p in events)
    assert percents[0] == 0


def test_check_cancelled_raises():
    ctx = JobContext()
    ctx.cancel()
    with pytest.raises(JobCancelled):
        ctx.check_cancelled()


def test_param_only_changes_are_throttled():
    events = []
    ctx = JobContext("x", lambda e, p: events.append(p))
    for i in range(200):
        ctx.progress(i / 2, "converting", {"file": f"f{i}.png"})
    assert len(events) < 10

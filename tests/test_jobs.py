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


def test_failed_job_can_be_retried_with_the_same_settings():
    sink = Collector()
    manager = JobManager(sink)
    calls = []

    def work(ctx):
        calls.append(ctx.job_id)
        if len(calls) == 1:
            raise ValueError("boom")
        return {"ok": True}

    job_id = manager.submit("test", work, title="clip.mp4")
    assert sink.finished.wait(5)
    assert manager.get(job_id)["retryable"] is True
    sink.finished.clear()
    new_id = manager.retry(job_id)
    assert new_id and new_id != job_id
    assert sink.finished.wait(5)
    assert calls == [job_id, new_id]
    assert manager.get(new_id)["title"] == "clip.mp4"
    assert manager.get(new_id)["status"] == "done"
    assert manager.retry(job_id) is None
    assert manager.retry(new_id) is None
    manager.shutdown()


def test_only_retryable_failed_jobs_run_again():
    sink = Collector()
    manager = JobManager(sink)

    def fail(ctx):
        raise ValueError("boom")

    job_id = manager.submit("probe", fail, retryable=False)
    assert sink.finished.wait(5)
    assert manager.get(job_id)["retryable"] is False
    assert manager.retry(job_id) is None
    assert manager.retry("missing") is None
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


def test_finished_jobs_are_saved_to_history(tmp_path):
    from backend.core.history import JobHistory

    saved = threading.Event()
    events = []

    def sink(event, payload):
        events.append((event, payload))
        if event == "jobs:history" and len([e for e, _ in events if e == "jobs:history"]) == 2:
            saved.set()

    history = JobHistory(tmp_path / "history.json")
    manager = JobManager(sink, history=history)
    converted = manager.submit("converter", lambda ctx: {"outPath": "C:/out/a.webp"}, title="WEBP")

    def fail(ctx):
        raise ValueError("boom")

    manager.submit("compressor", fail)
    manager.submit("download.probe", lambda ctx: {"title": "x"})
    assert saved.wait(5)
    manager.shutdown(wait=True)

    order = [(e, p.get("jobId") or p.get("id")) for e, p in events]
    assert order.index(("jobs:history", converted)) > order.index(("job:done", converted))
    by_kind = {e["kind"]: e for e in history.entries()}
    assert set(by_kind) == {"converter", "compressor"}
    assert by_kind["converter"]["outputs"] == ["C:/out/a.webp"]
    assert by_kind["compressor"]["status"] == "error" and by_kind["compressor"]["error"] == "boom"


def test_describe_sends_meta_and_keeps_it_in_the_job_info():
    sink = Collector()
    manager = JobManager(sink)

    def work(ctx):
        ctx.describe(height=1080, ext="mp4", uploader=None)
        ctx.describe(thumb="data:")
        return {}

    job_id = manager.submit("test", work)
    assert sink.finished.wait(5)
    metas = [p for e, p in sink.events if e == "job:meta"]
    assert metas == [{"jobId": job_id, "meta": {"height": 1080, "ext": "mp4"}}, {"jobId": job_id, "meta": {"thumb": "data:"}}]
    assert manager.get(job_id)["meta"] == {"height": 1080, "ext": "mp4", "thumb": "data:"}
    manager.shutdown()

"""Running a job from the history again: the saved bridge call, its limits and the checks before it runs."""

import json
import time

import pytest
from PIL import Image

from backend.bridge import api, replay
from backend.bridge.events import EventBus
from backend.core.errors import AppError
from backend.core.history import JobHistory
from backend.core.jobs import MAX_REPLAY_BYTES, JobManager
from backend.core.settings import Settings
from backend.services import download_queue


def _bridge(app_dirs):
    return api.Api(EventBus(), Settings(app_dirs / "settings.json"))


def _wait(bridge, job_id, timeout=20.0):
    """The job's history entry once it has finished and been saved."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        entry = bridge._ctx.history.get(job_id)
        if entry:
            return entry
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish")


def _image(path):
    Image.new("RGB", (40, 30), (200, 30, 30)).save(path)
    return path


def _history_job(job_id="a"):
    return {"id": job_id, "kind": "converter", "title": "WEBP", "status": "done", "startedAt": 1.0, "finishedAt": 2.0}


def test_a_large_or_non_json_call_is_not_saved(tmp_path):
    history = JobHistory(tmp_path / "history.json")
    jobs = JobManager(history=history)
    try:
        text = "x" * (MAX_REPLAY_BYTES + 1)
        big = jobs.submit("tts", lambda ctx: None, replay=replay.call("tts.synthesize", {"text": text}))
        odd = jobs.submit("tts", lambda ctx: None, replay=replay.call("tts.synthesize", {"when": object()}))
        small = jobs.submit("tts", lambda ctx: None, replay=replay.call("tts.synthesize", {"text": "hi"}))
        jobs.shutdown(wait=True, timeout=5)
    finally:
        jobs.shutdown()
    entries = {e["id"]: e for e in JobHistory(tmp_path / "history.json").entries()}
    assert "replay" not in entries[big]
    assert "replay" not in entries[odd]
    assert entries[small]["replay"] == {"method": "tts.synthesize", "args": [{"text": "hi"}]}


@pytest.mark.parametrize(
    "saved",
    [
        {"method": "system.restart", "args": []},
        {"method": "duplicates.trash", "args": [["C:/a.png"]]},
        {"method": "watermark.remove", "args": ["C:/a.png", "data:", "telea"]},
        {"method": "converter.start"},
        "converter.start",
    ],
)
def test_an_unknown_call_is_refused(saved):
    with pytest.raises(AppError) as err:
        replay.rerun(object(), saved)
    assert err.value.key == "errors.rerunUnsupported"


def test_a_missing_input_file_is_reported(tmp_path):
    saved = replay.call("ocr.images", {"paths": [str(tmp_path / "clipboard-20261101-101010.png")], "language": "pl"})
    with pytest.raises(AppError) as err:
        replay.rerun(object(), saved)
    assert err.value.key == "errors.rerunMissing"
    assert err.value.params == {"file": "clipboard-20261101-101010.png"}


def test_a_merge_checks_every_source_pdf(tmp_path):
    first = tmp_path / "a.pdf"
    first.write_bytes(b"%PDF")
    pages = [{"file": str(first), "page": 0}, {"file": str(tmp_path / "gone.pdf"), "page": 0}]
    with pytest.raises(AppError) as err:
        replay.rerun(object(), replay.call("pdf.merge", pages, str(tmp_path / "out.pdf")))
    assert err.value.params == {"file": "gone.pdf"}


def test_a_job_runs_again_after_a_restart(app_dirs):
    src = _image(app_dirs / "żółw.png")
    out = app_dirs / "wyniki"
    first = _bridge(app_dirs)
    try:
        job_id = first.converter.start({"files": [str(src)], "outputDir": str(out), "outFormat": "WEBP"})
        assert _wait(first, job_id)["status"] == "done"
    finally:
        first._shutdown()

    second = _bridge(app_dirs)
    try:
        assert second._ctx.jobs.get(job_id) is None
        new_id = second.jobs.rerun(job_id)
        entry = _wait(second, new_id)
        assert entry["status"] == "done"
        assert entry["replay"] == {"method": "converter.start", "args": [{"files": [str(src)], "outputDir": str(out), "outFormat": "WEBP"}]}
    finally:
        second._shutdown()
    assert sorted(p.name for p in out.iterdir()) == ["żółw (1).webp", "żółw.webp"]


def test_retry_of_an_earlier_run_uses_the_saved_call(app_dirs, monkeypatch):
    from backend.services import converter

    real_convert = converter.convert
    broken = {"on": True}

    def flaky_convert(ctx, opts):
        if broken["on"]:
            raise AppError("errors.diskFull")
        return real_convert(ctx, opts)

    monkeypatch.setattr(converter, "convert", flaky_convert)
    src = _image(app_dirs / "zdjęcie.png")
    out = app_dirs / "wyniki"
    first = _bridge(app_dirs)
    try:
        job_id = first.converter.start({"files": [str(src)], "outputDir": str(out), "outFormat": "WEBP"})
        assert _wait(first, job_id)["status"] == "error"
    finally:
        first._shutdown()

    broken["on"] = False
    second = _bridge(app_dirs)
    try:
        new_id = second.jobs.retry(job_id)
        assert new_id and new_id != job_id
        assert _wait(second, new_id)["status"] == "done"
        assert second.jobs.retry(new_id) is None  # a job that succeeded is not retried
    finally:
        second._shutdown()
    assert (out / "zdjęcie.webp").is_file()


def test_rerun_needs_a_saved_call(app_dirs):
    bridge = _bridge(app_dirs)
    try:
        bridge._ctx.history.record(_history_job("old"))
        with pytest.raises(AppError) as err:
            bridge.jobs.rerun("old")
        assert err.value.key == "errors.rerunUnsupported"
        assert bridge.jobs.retry("old") is None
        assert bridge.jobs.remove_history("old") is True
        assert bridge.jobs.history() == []
    finally:
        bridge._shutdown()


def test_a_queue_from_the_history_leaves_the_saved_queue_alone(app_dirs, monkeypatch):
    calls = []

    def fake_batch(ctx, urls, outdir, template, cookies, subtitles, **kwargs):
        calls.append({"urls": urls, "outdir": outdir, "cookies": cookies, **kwargs})
        return {"items": [], "outdir": outdir}

    monkeypatch.setattr(download_queue, "download_batch", fake_batch)
    monkeypatch.setattr(download_queue, "pending_queue", lambda: {"key": "saved-queue", "urls": ["https://x.com/a"]})
    bridge = _bridge(app_dirs)
    monkeypatch.setattr(bridge._ctx.settings, "cookie_files", lambda: ["C:/cookies/x.txt"])
    try:
        params = {"urls": ["https://youtu.be/a", " ", "https://youtu.be/b"], "outdir": str(app_dirs), "mode": "audio"}
        job_id = bridge.download.batch(params)
        entry = _wait(bridge, job_id)
        assert "cookies" not in json.dumps(entry["replay"])
        new_id = bridge.jobs.rerun(job_id)
        _wait(bridge, new_id)
    finally:
        bridge._shutdown()
    first, again = calls
    assert first["persist"] is True and first["replaces"] == "saved-queue"
    assert again["persist"] is False and again["replaces"] is None
    assert again["urls"] == ["https://youtu.be/a", "https://youtu.be/b"]
    assert again["mode"] == "audio" and again["cookies"] == ["C:/cookies/x.txt"]


def test_a_painted_background_mask_is_not_saved(app_dirs, monkeypatch):
    from backend.services import rembg_service

    monkeypatch.setattr(rembg_service, "remove", lambda ctx, params: {"resultPath": params["path"]})
    bridge = _bridge(app_dirs)
    try:
        plain = bridge.rembg.remove({"path": "C:/a.png", "model": "isnet"})
        painted = bridge.rembg.remove({"path": "C:/a.png", "model": "isnet", "userMask": "data:image/png;base64,AAAA"})
        assert _wait(bridge, plain)["replay"]["method"] == "rembg.remove"
        assert "replay" not in _wait(bridge, painted)
    finally:
        bridge._shutdown()

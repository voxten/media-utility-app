import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.bridge import api
from backend.core.errors import AppError
from backend.core.jobs import JobCancelled
from backend.core.settings import validate_patch
from backend.services import download, download_queue

URLS = ["https://example.com/a", "https://example.com/b", "https://example.com/c"]


@pytest.fixture
def queue_file(monkeypatch, tmp_path):
    path = tmp_path / "download_queue.json"
    monkeypatch.setattr(download_queue, "queue_path", lambda: path)
    monkeypatch.setattr(download_queue.time, "sleep", lambda s: None)
    monkeypatch.setattr(download_queue, "expand_batch_urls", lambda urls, cookies=None, ctx=None, report=False: [{"url": u, "title": u} for u in urls])
    return path


def test_batch_format():
    assert download.batch_format("audio") == "bestaudio/best"
    assert download.batch_format("audio", 720) == "bestaudio/best"
    assert download.batch_format("video") == download.AUTO_FORMAT
    assert download.batch_format("video", 720) == "bestvideo[height<=720]+bestaudio/best[height<=720]/best"


def _opts(mode, codec, embed, archive=None):
    hook = download._ProgressHook(None)
    return download._download_opts("https://example.com/v", "best", "%(title)s.%(ext)s", mode, codec, {}, hook, embed, archive)


def test_download_opts_embed_cover_and_metadata():
    video = _opts("video", "mp3", True, "C:/archive.txt")
    keys = [pp["key"] for pp in video["postprocessors"]]
    assert keys == ["FFmpegVideoConvertor", "FFmpegMetadata"]
    assert video["writethumbnail"] is True
    assert video["download_archive"] == "C:/archive.txt"

    assert _opts("audio", "mp3", True)["writethumbnail"] is True
    wav = _opts("audio", "wav", True)
    assert wav["writethumbnail"] is False
    assert [pp["key"] for pp in wav["postprocessors"]] == ["FFmpegExtractAudio", "FFmpegMetadata"]

    plain = _opts("video", "mp3", False)
    assert "writethumbnail" not in plain and "download_archive" not in plain
    assert [pp["key"] for pp in plain["postprocessors"]] == ["FFmpegVideoConvertor"]


def test_archive_count_and_clear(tmp_path):
    archive = tmp_path / "archive.txt"
    assert download.archive_count(archive) == 0
    archive.write_text("youtube abc\nyoutube def\n\nyoutube abc\n", encoding="utf-8")
    assert download.archive_count(archive) == 2
    download.clear_archive(archive)
    assert not archive.exists()
    download.clear_archive(archive)


def test_queue_file_round_trip(tmp_path):
    path = tmp_path / "queue.json"
    options = {"outdir": "C:/Pobrane ąę", "mode": "audio"}
    download_queue.save_queue("job1", URLS, options, path)
    assert download_queue.load_queue(path) == {"key": "job1", "urls": URLS, "options": options}
    download_queue.save_queue("job1", [], options, path)
    assert not path.exists()
    assert download_queue.load_queue(path) is None


def test_each_queue_keeps_its_own_entry(tmp_path):
    path = tmp_path / "queue.json"
    download_queue.save_queue("a", URLS[:1], {"outdir": "A"}, path)
    download_queue.save_queue("b", URLS[1:], {"outdir": "B"}, path)
    assert download_queue.load_queue(path)["key"] == "b"
    assert download_queue.load_queue(path, exclude={"b"})["urls"] == URLS[:1]

    download_queue.save_queue("b", [], {}, path)
    assert download_queue.load_queue(path) == {"key": "a", "urls": URLS[:1], "options": {"outdir": "A"}}


def test_version_1_queue_file_is_still_offered(tmp_path):
    path = tmp_path / "queue.json"
    path.write_text(json.dumps({"version": 1, "urls": URLS, "options": {"outdir": "x"}}), encoding="utf-8")
    assert download_queue.load_queue(path)["urls"] == URLS


@pytest.mark.parametrize(
    "content",
    ["not json", json.dumps([1, 2]), json.dumps({"version": 99, "queues": {"a": {"urls": URLS, "options": {"outdir": "x"}}}}),
     json.dumps({"version": 2, "queues": {"a": {"urls": [], "options": {"outdir": "x"}}}}),
     json.dumps({"version": 2, "queues": {"a": {"urls": URLS, "options": {}}}}),
     json.dumps({"version": 2, "queues": [1]})],
)
def test_broken_queue_file_is_ignored(tmp_path, content):
    path = tmp_path / "queue.json"
    path.write_text(content, encoding="utf-8")
    assert download_queue.load_queue(path) is None


class _FakeYDL:
    """Stands in for UniqueYoutubeDL: one video with id ``abc`` that the archive already lists."""

    def __init__(self, opts, target_ext=None):
        self.opts = opts
        self.archive = {"youtube abc"}
        self.downloaded = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def add_post_processor(self, pp, when=None):
        pass

    def add_info_extractor(self, ie):
        pass

    def extract_info(self, url, download=True, process=True, **kwargs):
        return {"id": "abc", "extractor_key": "Youtube", "title": "Film"}

    def in_download_archive(self, info):
        return bool(self.archive)

    def process_ie_result(self, info, download=True):
        self.downloaded = True
        path = Path(self.opts["outtmpl"]).with_name("Film.mp4")
        path.write_bytes(b"x")
        return {**info, "filepath": str(path), "ext": "mp4"}

    def prepare_filename(self, info):
        return info["filepath"]


def test_run_ydl_skips_archived_links_only_when_asked(monkeypatch, ctx, tmp_path):
    monkeypatch.setattr(download, "UniqueYoutubeDL", _FakeYDL)

    def opts():
        return _opts("video", "mp3", False) | {"outtmpl": str(tmp_path / "%(title)s.%(ext)s")}

    assert download._run_ydl(ctx, "https://youtu.be/abc", opts(), "mp4", skip_archived=True) == {"skipped": True, "title": "Film"}
    assert not (tmp_path / "Film.mp4").exists()

    result = download._run_ydl(ctx, "https://youtu.be/abc", opts(), "mp4")
    assert result["path"] == str(tmp_path / "Film.mp4")
    assert "skipped" not in result


def _fake_run(outcomes):
    """A _run_ydl replacement answering per URL: "done", "skipped" or "cancel"."""

    def run(ctx, url, opts, target_ext=None, photos=False, skip_archived=False):
        run.calls.append({"url": url, "format": opts["format"], "target_ext": target_ext, "skip": skip_archived})
        outcome = outcomes.get(url, "done")
        if outcome == "cancel":
            raise JobCancelled()
        if outcome == "skipped":
            return {"skipped": True, "title": "Old"}
        return {"title": url, "path": f"{url}.mp3", "size": 10}

    run.calls = []
    return run


def test_batch_audio_mode_skips_and_clears_the_saved_queue(monkeypatch, ctx, tmp_path, queue_file):
    run = _fake_run({URLS[1]: "skipped"})
    monkeypatch.setattr(download_queue, "_run_ydl", run)

    result = download_queue.download_batch(
        ctx, URLS, str(tmp_path), mode="audio", audio_codec="m4a", skip_archived=True, persist=True
    )

    assert {c["format"] for c in run.calls} == {"bestaudio/best"}
    assert {c["target_ext"] for c in run.calls} == {"m4a"}
    assert all(c["skip"] for c in run.calls)
    assert (result["succeeded"], result["skipped"], result["failed"]) == (2, 1, 0)
    assert [p["data"]["status"] for p in ctx.of("job:partial") if p["data"]["index"] == 1][-1] == "skipped"
    assert not queue_file.exists()


def test_cancelled_batch_keeps_the_unfinished_links(monkeypatch, ctx, tmp_path, queue_file):
    monkeypatch.setattr(download_queue, "_run_ydl", _fake_run({URLS[1]: "cancel"}))

    with pytest.raises(JobCancelled):
        download_queue.download_batch(ctx, URLS, str(tmp_path), mode="video", max_height=720, persist=True)

    assert ctx.meta["urls"] == URLS
    saved = download_queue.load_queue()
    assert saved["urls"] == URLS[1:]
    assert saved["options"]["maxHeight"] == 720
    assert saved["options"]["outdir"] == str(tmp_path)


def test_batch_without_persist_writes_no_file(monkeypatch, ctx, tmp_path, queue_file):
    monkeypatch.setattr(download_queue, "_run_ydl", _fake_run({URLS[0]: "cancel"}))
    with pytest.raises(JobCancelled):
        download_queue.download_batch(ctx, URLS, str(tmp_path))
    assert not queue_file.exists()


def test_running_queue_is_not_offered_for_resuming(ctx, queue_file):
    download_queue.save_queue("old", URLS, {"outdir": "C:/x"})
    assert download_queue.pending_queue()["urls"] == URLS
    download_queue._active_batches["old"] = download_queue.ActiveBatchQueue(ctx, {})
    try:
        assert download_queue.pending_queue() is None
    finally:
        download_queue._active_batches.pop("old")
    download_queue.discard_queue()
    assert download_queue.pending_queue() is None


def test_finished_batch_keeps_the_links_of_another_running_batch(monkeypatch, tmp_path, queue_file):
    from tests.conftest import RecordingContext

    first, second = RecordingContext("first"), RecordingContext("second")
    monkeypatch.setattr(download_queue, "_run_ydl", _fake_run({URLS[0]: "cancel"}))
    with pytest.raises(JobCancelled):
        download_queue.download_batch(first, URLS, str(tmp_path / "A"), persist=True)

    download_queue.download_batch(second, URLS[2:], str(tmp_path / "B"), persist=True)

    saved = download_queue.load_queue()
    assert saved["key"] == "first"
    assert saved["urls"] == URLS


def test_resumed_queue_replaces_the_saved_one(monkeypatch, ctx, tmp_path, queue_file):
    download_queue.save_queue("old", URLS, {"outdir": str(tmp_path)})
    monkeypatch.setattr(download_queue, "_run_ydl", _fake_run({URLS[1]: "cancel"}))

    with pytest.raises(JobCancelled):
        download_queue.download_batch(ctx, URLS, str(tmp_path), persist=True, replaces="old")

    saved = download_queue.load_queue()
    assert saved["key"] == ctx.job_id
    assert saved["urls"] == URLS[1:]
    assert download_queue.load_queue(exclude={ctx.job_id}) is None


def test_download_settings_are_booleans():
    assert validate_patch({"downloadEmbedMeta": False, "downloadSkipArchived": True})
    with pytest.raises(ValueError):
        validate_patch({"downloadSkipArchived": "yes"})


def test_resumed_queue_keeps_sponsorblock(monkeypatch, ctx, tmp_path, queue_file):
    monkeypatch.setattr(download_queue, "_run_ydl", _fake_run({URLS[1]: "cancel"}))
    with pytest.raises(JobCancelled):
        download_queue.download_batch(ctx, URLS, str(tmp_path), persist=True, sponsorblock=True)
    assert download_queue.load_queue()["options"]["sponsorblock"] is True

    started = {}
    monkeypatch.setattr(download_queue, "download_batch", lambda job_ctx, urls, *args, **kwargs: started.update(urls=urls, **kwargs))
    settings = SimpleNamespace(cookie_files=lambda: {}, get=lambda key: False)
    jobs = SimpleNamespace(submit=lambda kind, fn, title: fn(ctx))
    api.DownloadApi(SimpleNamespace(settings=settings, jobs=jobs)).resume_queue()

    assert started["urls"] == URLS[1:]
    assert started["sponsorblock"] is True


class _Gate:
    """A _run_ydl replacement whose downloads wait until the test lets them finish.

    ``outcomes`` answers per URL: "done" (default) or "error"; ``started`` records the URLs in the
    order they began, ``live`` how many run at the same moment.
    """

    def __init__(self, outcomes=None):
        self.outcomes = outcomes or {}
        self.lock = threading.Lock()
        self.started = []
        self.opts = {}
        self.release = {}
        self.live = 0
        self.most_live = 0

    def __call__(self, ctx, url, opts, target_ext=None, photos=False, skip_archived=False):
        event = threading.Event()
        with self.lock:
            self.started.append(url)
            self.opts[url] = opts
            self.release[url] = event
            self.live += 1
            self.most_live = max(self.most_live, self.live)
        try:
            while not event.wait(0.01):
                ctx.check_cancelled()
            outcome = self.outcomes.get(url, "done")
            if outcome == "error":
                raise RuntimeError("broken link")
            return {"title": url, "path": f"{url}.mp4", "size": 10}
        finally:
            with self.lock:
                self.live -= 1

    def wait_started(self, count, timeout=5.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self.lock:
                if len(self.started) >= count:
                    return
            threading.Event().wait(0.005)
        raise AssertionError(f"only {self.started} started")

    def finish(self, url):
        self.wait_for(url)
        self.release[url].set()

    def wait_for(self, url, timeout=5.0):
        deadline = time.monotonic() + timeout
        while url not in self.release:
            assert time.monotonic() < deadline, f"{url} never started"
            threading.Event().wait(0.005)


class _BatchThread:
    """Runs download_batch in the background and keeps its result or error."""

    def __init__(self, ctx, urls, outdir, **kwargs):
        self.result = None
        self.error = None
        self.thread = threading.Thread(target=self._run, args=(ctx, urls, outdir), kwargs=kwargs, daemon=True)
        self.thread.start()

    def _run(self, ctx, urls, outdir, **kwargs):
        try:
            self.result = download_queue.download_batch(ctx, urls, outdir, **kwargs)
        except BaseException as exc:  # noqa: BLE001 - checked by the test
            self.error = exc

    def join(self):
        self.thread.join(10)
        assert not self.thread.is_alive()
        return self.result


def _queue(job_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        with download_queue._active_batches_lock:
            queue = download_queue._active_batches.get(job_id)
        if queue:
            return queue
        threading.Event().wait(0.005)
    raise AssertionError("the queue never started")


def _statuses(ctx):
    last = {}
    for payload in ctx.of("job:partial"):
        last[payload["data"]["index"]] = payload["data"]["status"]
    return last


def test_two_links_download_at_once(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS, str(tmp_path), parallel=2)

    gate.wait_started(2)
    assert gate.started == URLS[:2]
    gate.finish(URLS[1])
    gate.wait_started(3)
    gate.finish(URLS[0])
    gate.finish(URLS[2])
    result = batch.join()

    assert gate.most_live == 2
    assert result["succeeded"] == 3
    running = [p["running"] for p in ctx.of("job:progress") if p.get("running")]
    assert any(len(items) == 2 for items in running)


def test_parallel_is_capped(ctx):
    assert download_queue.ActiveBatchQueue(ctx, {}, parallel=9).parallel == download_queue.MAX_PARALLEL
    assert download_queue.ActiveBatchQueue(ctx, {}, parallel=0).parallel == 1


def test_reorder_changes_the_download_order_and_the_resume_file(monkeypatch, ctx, tmp_path, queue_file):
    urls = URLS + ["https://example.com/d"]
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, urls, str(tmp_path), persist=True)

    gate.wait_started(1)
    queue = _queue(ctx.job_id)
    assert download_queue.reorder_batch(ctx.job_id, [0, 3, "x", 2, 99, True])
    assert queue.order == [0, 3, 2, 1]
    assert download_queue.load_queue()["urls"] == [urls[0], urls[3], urls[2], urls[1]]
    assert ctx.of("job:progress")[-1]["order"] == [0, 3, 2, 1]

    for url in (urls[0], urls[3], urls[2], urls[1]):
        gate.finish(url)
    result = batch.join()

    assert gate.started == [urls[0], urls[3], urls[2], urls[1]]
    assert [item["index"] for item in result["items"]] == [0, 3, 2, 1]


def test_cancelled_queue_resumes_in_the_new_order(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS, str(tmp_path), persist=True)

    gate.wait_started(1)
    download_queue.reorder_batch(ctx.job_id, [2, 1])
    ctx.cancel()
    batch.join()

    assert isinstance(batch.error, JobCancelled)
    assert download_queue.load_queue()["urls"] == [URLS[2], URLS[1], URLS[0]]


def test_skipping_a_waiting_link_leaves_it_out(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS, str(tmp_path), persist=True)

    gate.wait_started(1)
    assert download_queue.skip_batch_item(ctx.job_id, 1)
    assert not download_queue.skip_batch_item(ctx.job_id, 1)
    assert download_queue.load_queue()["urls"] == [URLS[0], URLS[2]]
    gate.finish(URLS[0])
    gate.finish(URLS[2])
    result = batch.join()

    assert gate.started == [URLS[0], URLS[2]]
    assert [item["status"] for item in result["items"]] == ["done", "cancelled", "done"]


def test_skipping_a_running_link_stops_only_that_link(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS, str(tmp_path), parallel=2, persist=True)

    gate.wait_started(2)
    assert download_queue.skip_batch_item(ctx.job_id, 0)
    gate.wait_started(3)
    gate.finish(URLS[1])
    gate.finish(URLS[2])
    result = batch.join()

    assert batch.error is None
    assert not ctx.cancelled
    assert [item["status"] for item in result["items"]] == ["cancelled", "done", "done"]
    assert not queue_file.exists()


def test_retry_failed_requeues_failed_links_of_a_running_queue(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate({URLS[0]: "error"})
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS, str(tmp_path))

    gate.finish(URLS[0])
    gate.wait_started(2)
    queue = _queue(ctx.job_id)
    while queue.results.get(0, {}).get("status") != "error":
        threading.Event().wait(0.005)
    gate.outcomes.clear()
    assert download_queue.retry_failed(ctx.job_id) == {"requeued": 1}
    assert _statuses(ctx)[0] == "pending"

    gate.finish(URLS[1])
    gate.finish(URLS[2])
    gate.wait_started(4)
    gate.release[URLS[0]].set()
    result = batch.join()

    assert gate.started == [URLS[0], URLS[1], URLS[2], URLS[0]]
    assert result["succeeded"] == 3 and result["failed"] == 0


def test_retry_failed_after_the_queue_uses_its_own_options(monkeypatch, ctx, tmp_path, queue_file):
    failing = _fake_run({})

    def run(job_ctx, url, opts, **kwargs):
        if url == URLS[1]:
            raise RuntimeError("broken link")
        return failing(job_ctx, url, opts, **kwargs)

    monkeypatch.setattr(download_queue, "_run_ydl", run)
    download_queue.download_batch(ctx, URLS, str(tmp_path), mode="audio", audio_codec="m4a", max_height=720, sponsorblock=True)

    started = {}
    monkeypatch.setattr(
        download_queue, "download_batch", lambda job_ctx, urls, outdir, *args, **kwargs: started.update(urls=urls, outdir=outdir, **kwargs)
    )
    settings = SimpleNamespace(cookie_files=lambda: {}, get=lambda key: {"downloadParallel": 2, "downloadRateLimit": 5}.get(key))
    jobs = SimpleNamespace(submit=lambda kind, fn, title: fn(ctx) or "new-job")
    bridge = api.DownloadApi(SimpleNamespace(settings=settings, jobs=jobs))

    assert bridge.retry_failed(ctx.job_id) == "new-job"
    assert started["urls"] == [URLS[1]]
    assert started["outdir"] == str(tmp_path)
    assert (started["mode"], started["audio_codec"], started["max_height"], started["sponsorblock"]) == ("audio", "m4a", 720, True)
    assert (started["parallel"], started["rate_limit"]) == (2, 5 * download_queue.MEGABYTE)
    assert started["replaces"] is None

    with pytest.raises(AppError):
        bridge.retry_failed(ctx.job_id)


def test_link_added_while_the_last_one_downloads_is_downloaded(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS[:1], str(tmp_path))

    gate.wait_started(1)
    assert download_queue.add_to_batch(ctx.job_id, [URLS[1]])
    gate.finish(URLS[0])
    gate.finish(URLS[1])
    result = batch.join()

    assert result["succeeded"] == 2
    assert not download_queue.add_to_batch(ctx.job_id, [URLS[2]])


def test_rate_limit_is_shared_and_fetches_one_fragment_at_a_time(monkeypatch, ctx, tmp_path, queue_file):
    gate = _Gate()
    monkeypatch.setattr(download_queue, "_run_ydl", gate)
    batch = _BatchThread(ctx, URLS[:2], str(tmp_path), parallel=2, rate_limit=4 * download_queue.MEGABYTE)

    gate.wait_started(2)
    for url in URLS[:2]:
        gate.finish(url)
    batch.join()

    for url in URLS[:2]:
        assert gate.opts[url]["ratelimit"] == 2 * download_queue.MEGABYTE
        assert gate.opts[url]["concurrent_fragment_downloads"] == 1


def test_without_a_rate_limit_fragments_stay_parallel(monkeypatch, ctx, tmp_path, queue_file):
    run = _fake_run({})
    seen = []
    monkeypatch.setattr(download_queue, "_run_ydl", lambda c, url, opts, **kw: seen.append(opts) or run(c, url, opts, **kw))
    download_queue.download_batch(ctx, URLS[:1], str(tmp_path), parallel=3)
    assert "ratelimit" not in seen[0]
    assert seen[0]["concurrent_fragment_downloads"] == download.FRAGMENT_WORKERS


def test_progress_reports_are_throttled(ctx):
    queue = download_queue.ActiveBatchQueue(ctx, {})
    queue.items = [{"index": 0, "url": "u", "title": "u"}]
    queue.order = [0]
    item = download_queue._ItemContext(queue, 0)
    queue.running[0] = item
    for percent in range(50):
        item.progress(percent, "download.status.downloading", speed=100)
    reports = ctx.of("job:progress")
    assert 1 <= len(reports) <= 2
    assert reports[0]["running"] == [{"index": 0, "percent": 0.0, "speed": 100}]


def test_parallel_and_rate_limit_settings():
    assert validate_patch({"downloadParallel": 3, "downloadRateLimit": 20})
    for bad in ({"downloadParallel": 4}, {"downloadParallel": True}, {"downloadRateLimit": 3}, {"downloadRateLimit": 2.0}):
        with pytest.raises(ValueError):
            validate_patch(bad)

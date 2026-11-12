import json
from pathlib import Path

import pytest

from backend.core.jobs import JobCancelled
from backend.core.settings import validate_patch
from backend.services import download, download_queue

URLS = ["https://example.com/a", "https://example.com/b", "https://example.com/c"]


@pytest.fixture
def queue_file(monkeypatch, tmp_path):
    path = tmp_path / "download_queue.json"
    monkeypatch.setattr(download_queue, "queue_path", lambda: path)
    monkeypatch.setattr(download_queue.time, "sleep", lambda s: None)
    monkeypatch.setattr(download_queue, "expand_batch_urls", lambda urls, cookies=None: [{"url": u, "title": u} for u in urls])
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

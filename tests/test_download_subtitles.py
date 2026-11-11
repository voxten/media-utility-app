from pathlib import Path

import pytest

from backend.core import whisper_models
from backend.services import download, transcribe
from backend.services.transcribe import Cue, Word

URL = "https://www.youtube.com/watch?v=abc"


@pytest.fixture
def media(tmp_path) -> Path:
    path = tmp_path / "Film.mp4"
    path.write_bytes(b"x")
    return path


def _logs(ctx):
    return [e["message"] for e in ctx.of("job:log")]


def _no_whisper(*args, **kwargs):
    raise AssertionError("Whisper must not run")


def test_site_subtitles_skip_whisper(monkeypatch, ctx, media):
    found = [str(media.with_suffix(".pl.srt"))]
    seen = {}

    def fake_fetch(url, path, languages, cookies):
        seen["languages"] = languages
        return found

    monkeypatch.setattr(download, "_fetch_site_subtitles", fake_fetch)
    monkeypatch.setattr(transcribe, "transcribe_file", _no_whisper)
    files = download.add_subtitles(ctx, URL, str(media), {"mode": "auto", "languages": ["pl", "en"]}, {}, 70, 30)
    assert files == found
    assert seen["languages"] == ["pl", "en"]
    assert "download.log.subtitlesSaved" in _logs(ctx)


def test_site_mode_without_subtitles_only_logs(monkeypatch, ctx, media):
    monkeypatch.setattr(download, "_fetch_site_subtitles", lambda *a: [])
    monkeypatch.setattr(transcribe, "transcribe_file", _no_whisper)
    assert download.add_subtitles(ctx, URL, str(media), {"mode": "site", "languages": ["pl"]}, {}, 70, 30) == []
    assert "download.log.noSubtitles" in _logs(ctx)


def test_whisper_fallback_writes_srt(monkeypatch, ctx, media):
    def failing_fetch(*args):
        raise RuntimeError("HTTP Error 429: Too Many Requests")

    monkeypatch.setattr(download, "_fetch_site_subtitles", failing_fetch)
    monkeypatch.setattr(whisper_models, "is_ready", lambda model_id: True)
    calls = {}

    def fake_transcribe(ctx, path, model, language=None, progress_start=0.0, progress_span=100.0):
        calls.update(model=model, language=language, start=progress_start, span=progress_span)
        return {
            "segments": [Cue(0.0, 1.5, "Cześć.")],
            "words": [Word(0.0, 1.5, " Cześć.")],
            "language": "pl",
            "duration": 1.5,
        }

    monkeypatch.setattr(transcribe, "transcribe_file", fake_transcribe)
    subtitles = {"mode": "auto", "languages": ["pl"], "model": "turbo", "language": ""}
    files = download.add_subtitles(ctx, URL, str(media), subtitles, {}, 70, 30)

    assert files == [str(media.with_suffix(".pl.srt"))]
    assert "Cześć." in Path(files[0]).read_text(encoding="utf-8-sig")
    assert calls == {"model": "turbo", "language": None, "start": 70, "span": 30}
    assert "download.log.subtitlesFailed" in _logs(ctx)


def test_whisper_model_missing_is_a_warning(monkeypatch, ctx, media):
    monkeypatch.setattr(download, "_fetch_site_subtitles", lambda *a: [])
    monkeypatch.setattr(whisper_models, "is_ready", lambda model_id: False)
    monkeypatch.setattr(transcribe, "transcribe_file", _no_whisper)
    assert download.add_subtitles(ctx, URL, str(media), {"mode": "auto"}, {}, 70, 30) == []
    warnings = [e for e in ctx.of("job:log") if e["level"] == "warning"]
    assert warnings[0]["message"] == "download.log.whisperMissing"
    assert warnings[0]["params"] == {"model": "small"}


def test_photos_and_off_mode_are_skipped(monkeypatch, ctx, tmp_path, media):
    monkeypatch.setattr(download, "_fetch_site_subtitles", _no_whisper)
    photo = tmp_path / "post 1.jpg"
    photo.write_bytes(b"x")
    assert download.add_subtitles(ctx, URL, str(photo), {"mode": "auto"}, {}, 70, 30) == []
    assert download.add_subtitles(ctx, URL, str(media), {"mode": "off"}, {}, 70, 30) == []
    assert download.add_subtitles(ctx, URL, str(media), {}, {}, 70, 30) == []


def test_download_leaves_room_for_subtitles(monkeypatch, ctx, tmp_path):
    out = tmp_path / "Film.mp4"
    seen = {}

    def fake_run(ctx, url, opts, target_ext=None, photos=False):
        hook = opts["progress_hooks"][0]
        hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100})
        hook({"status": "finished"})
        out.write_bytes(b"x")
        return {"title": "Film", "path": str(out), "size": 1}

    def fake_subtitles(ctx, url, path, subtitles, cookies, start, span):
        seen.update(start=start, span=span)
        return [str(out.with_suffix(".en.srt"))]

    monkeypatch.setattr(download, "_run_ydl", fake_run)
    monkeypatch.setattr(download, "add_subtitles", fake_subtitles)
    result = download.download(ctx, URL, "auto", str(tmp_path), subtitles={"mode": "site", "languages": ["en"]})

    assert result["subtitles"] == [str(out.with_suffix(".en.srt"))]
    assert seen == {"start": pytest.approx(70), "span": pytest.approx(30)}
    percents = [e["percent"] for e in ctx.of("job:progress") if e.get("percent") is not None]
    assert pytest.approx(35) in percents  # half of the download = half of its 70 % share

"""Cancel stops work that used to run to the end: link checks, yt-dlp's FFmpeg steps, speech synthesis."""

import asyncio
import subprocess
import sys
import threading
import time
import types
import wave

import pytest

from backend.core.jobs import JobCancelled
from backend.services import download, download_queue, tts


def test_checking_many_links_stops_when_cancelled(monkeypatch, ctx):
    checked = []

    def listing(url, opts):
        checked.append(url)
        if len(checked) == 2:
            ctx.cancel()
        return None

    monkeypatch.setattr(download_queue, "_extract_listing", listing)
    with pytest.raises(JobCancelled):
        download_queue.expand_batch_urls([f"https://example.com/{n}" for n in range(100)], ctx=ctx, report=True)
    assert len(checked) == 2
    assert ctx.of("job:progress")[0]["params"] == {"current": 1, "total": 100}


def test_yt_dlp_ffmpeg_step_is_killed_when_cancelled(ctx):
    import yt_dlp.postprocessor.ffmpeg as yt_dlp_ffmpeg

    threading.Timer(0.3, ctx.cancel).start()
    started = time.monotonic()
    with download._ffmpeg_stops_with(ctx), pytest.raises(JobCancelled):
        yt_dlp_ffmpeg.Popen.run(
            [sys.executable, "-c", "import time; time.sleep(30)"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    assert time.monotonic() - started < 10


def test_yt_dlp_ffmpeg_runs_as_before_outside_a_job():
    import yt_dlp.postprocessor.ffmpeg as yt_dlp_ffmpeg

    out, err, code = yt_dlp_ffmpeg.Popen.run(
        [sys.executable, "-c", "print('done')"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    assert (out.strip(), code) == ("done", 0)


def test_long_text_is_split_at_sentence_ends():
    text = "Pierwsze zdanie. " * 50 + "Ostatnie zdanie bez kropki"
    parts = tts.split_text(text, size=100)
    assert len(parts) > 5
    assert all(len(part) <= 100 for part in parts)
    assert " ".join(parts).split() == text.split()
    assert tts.split_text("Krótko.") == ["Krótko."]


def test_spoken_parts_are_joined_into_one_wav(tmp_path):
    parts = []
    for n in range(3):
        path = tmp_path / f"part{n}.wav"
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(b"\x01\x00" * 1600)
        parts.append(path)
    out = tmp_path / "speech.wav"
    tts.join_wavs(parts, out)
    with wave.open(str(out), "rb") as w:
        assert w.getnframes() == 4800 and w.getframerate() == 16000


def test_online_speech_stops_when_cancelled(monkeypatch, ctx):
    class Communicate:
        def __init__(self, text, voice, rate):
            pass

        async def stream(self):
            for n in range(1000):
                if n == 3:
                    ctx.cancel()
                yield {"type": "audio", "data": b"x"}
                yield {"type": "SentenceBoundary", "text": "jedno zdanie"}
                await asyncio.sleep(0)

    monkeypatch.setitem(sys.modules, "edge_tts", types.SimpleNamespace(Communicate=Communicate))
    with pytest.raises(JobCancelled):
        asyncio.run(tts._edge_bytes(ctx, "jedno zdanie " * 1000, "pl-PL-MarekNeural", "+0%"))
    assert ctx.of("job:progress")

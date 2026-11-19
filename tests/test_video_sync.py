import subprocess
import pytest
from pathlib import Path
from backend.services import video_sync
from tests.conftest import served


def _create_sample_video(path: Path, duration: int = 3) -> Path:
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=320x240:rate=15",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        str(path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return path


def test_probe_media(tmp_path):
    vid = _create_sample_video(tmp_path / "sample.mp4", duration=2)
    meta = video_sync.probe_media(str(vid))

    assert meta["fileName"] == "sample.mp4"
    assert meta["hasVideo"] is True
    assert meta["hasAudio"] is True
    assert meta["duration"] > 0
    assert len(meta["audioTracks"]) >= 1
    assert meta["audioTracks"][0]["codec"] == "aac"


def test_extract_waveform(tmp_path):
    vid = _create_sample_video(tmp_path / "waveform_test.mp4", duration=3)
    res = video_sync.extract_waveform(str(vid), points=100)

    assert len(res["points"]) == 100
    assert all(0.0 <= p <= 1.0 for p in res["points"])
    assert res["duration"] > 0


def test_extract_frames(tmp_path):
    vid = _create_sample_video(tmp_path / "frames_test.mp4", duration=3)
    res = video_sync.extract_frames(str(vid), start_sec=0.0, duration=3.0, count=4, height=48)

    assert [f["time"] for f in res["frames"]] == [0.375, 1.125, 1.875, 2.625]
    assert all(f["dataUrl"].startswith("data:image/jpeg;base64,") for f in res["frames"])


def test_generate_preview(tmp_path):
    vid = _create_sample_video(tmp_path / "preview_test.mp4", duration=4)
    # Test positive audio delay
    p_pos = video_sync.generate_preview(str(vid), offset_sec=0.5, start_sec=0.5, duration=2.0)
    assert served(p_pos["previewUrl"])[4:8] == b"ftyp"
    assert p_pos["sizeBytes"] > 0

    # Test negative audio delay (audio lead)
    p_neg = video_sync.generate_preview(str(vid), offset_sec=-0.5, start_sec=0.0, duration=2.0)
    assert served(p_neg["previewUrl"])[4:8] == b"ftyp"
    assert p_neg["sizeBytes"] > 0


def test_sync_video_job(tmp_path, ctx):
    vid = _create_sample_video(tmp_path / "export_src.mp4", duration=3)
    out = tmp_path / "export_out.mp4"

    res = video_sync.sync_video(ctx, {
        "videoPath": str(vid),
        "offsetSec": 0.25,
        "audioTrackIndex": 0,
        "outputPath": str(out),
        "mode": "fast_copy",
    })

    assert res["fileName"] == "export_out.mp4"
    assert out.is_file()
    assert res["bytes"] > 0


def test_waveform_points_cover_every_sample_evenly():
    import numpy as np

    samples = np.zeros(1050, dtype="<f4")
    samples[0], samples[-1] = -1.0, 0.5
    points, max_peak = video_sync._peaks(samples.tobytes(), 100)
    assert len(points) == 100 and max_peak == 1.0
    assert points[0] == 1.0 and points[-1] == 0.5

    short, _ = video_sync._peaks(np.full(30, 0.2, dtype="<f4").tobytes(), 100)
    assert short == [1.0] * 30


def test_subtitles_are_kept_where_the_container_can_hold_them():
    subs = [{"index": 2, "codec": "subrip"}, {"index": 3, "codec": "hdmv_pgs_subtitle"}]
    assert video_sync._subtitle_args(subs, ".mp4") == (["-map", "0:2", "-c:s", "mov_text"], 1)
    assert video_sync._subtitle_args(subs, ".MKV") == (["-map", "0:2", "-map", "0:3", "-c:s", "copy"], 0)
    assert video_sync._subtitle_args(subs, ".avi") == ([], 2)
    assert video_sync._subtitle_args([], ".mp4") == ([], 0)


def test_delayed_audio_keeps_the_video_length_subtitles_and_chapters(tmp_path, ctx):
    srt = tmp_path / "subs.srt"
    srt.write_text("1\n00:00:00,500 --> 00:00:01,000\nHello\n", encoding="utf-8")
    chapters = tmp_path / "chapters.txt"
    chapters.write_text(";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1500\ntitle=Intro\n", encoding="utf-8")
    src = tmp_path / "film.mkv"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-i", str(srt), "-i", str(chapters),
        "-map", "0", "-map", "1", "-map", "2", "-map_chapters", "3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:s", "srt",
        str(src),
    ], check=True)
    assert video_sync.probe_media(str(src))["videoDuration"] == pytest.approx(3.0, abs=0.1)

    out = tmp_path / "film_synced.mp4"
    video_sync.sync_video(ctx, {"videoPath": str(src), "offsetSec": 1.0, "outputPath": str(out), "mode": "fast_copy"})

    meta = video_sync.probe_media(str(out))
    assert meta["duration"] == pytest.approx(3.0, abs=0.15)
    assert [s["codec"] for s in meta["subtitles"]] == ["mov_text"]
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_chapters", "-of", "csv", str(out)], capture_output=True, text=True)
    assert "Intro" in probe.stdout


def test_mov_text_subtitles_become_srt_in_matroska():
    subs = [{"index": 2, "codec": "subrip"}, {"index": 3, "codec": "mov_text"}]
    assert video_sync._subtitle_args(subs, ".mkv") == (
        ["-map", "0:2", "-map", "0:3", "-c:s", "copy", "-c:s:1", "srt"], 0
    )


def test_mp4_subtitles_export_to_matroska(tmp_path, ctx):
    srt = tmp_path / "subs.srt"
    srt.write_text("1\n00:00:00,500 --> 00:00:01,000\nHello\n", encoding="utf-8")
    src = tmp_path / "clip.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-i", str(srt),
        "-map", "0", "-map", "1", "-map", "2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:s", "mov_text",
        str(src),
    ], check=True)

    out = tmp_path / "clip.mkv"
    video_sync.sync_video(ctx, {"videoPath": str(src), "offsetSec": 0.5, "outputPath": str(out), "mode": "fast_copy"})

    assert [s["codec"] for s in video_sync.probe_media(str(out))["subtitles"]] == ["subrip"]


def test_export_never_overwrites_an_existing_file(tmp_path, ctx):
    vid = _create_sample_video(tmp_path / "src.mp4", duration=2)
    out = tmp_path / "out.mp4"
    out.write_bytes(b"keep")

    res = video_sync.sync_video(ctx, {"videoPath": str(vid), "offsetSec": 0.0, "outputPath": str(out), "mode": "fast_copy"})

    assert out.read_bytes() == b"keep"
    assert res["fileName"] == "out (1).mp4"
    assert (tmp_path / "out (1).mp4").is_file()

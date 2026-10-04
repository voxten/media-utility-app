import subprocess
import pytest
from pathlib import Path
from backend.services import video_sync


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


def test_generate_preview(tmp_path):
    vid = _create_sample_video(tmp_path / "preview_test.mp4", duration=4)
    # Test positive audio delay
    p_pos = video_sync.generate_preview(str(vid), offset_sec=0.5, start_sec=0.5, duration=2.0)
    assert p_pos["previewUrl"].startswith("data:video/mp4;base64,")
    assert p_pos["sizeBytes"] > 0

    # Test negative audio delay (audio lead)
    p_neg = video_sync.generate_preview(str(vid), offset_sec=-0.5, start_sec=0.0, duration=2.0)
    assert p_neg["previewUrl"].startswith("data:video/mp4;base64,")
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

import subprocess
from pathlib import Path

import pytest

from backend.core import ffmpeg
from backend.core.errors import AppError
from backend.services import media_convert
from backend.services.media_convert import Options

needs_ffmpeg = pytest.mark.skipif(not ffmpeg.has_binary("ffmpeg"), reason="ffmpeg not installed")


def _sample(path: Path, duration: int = 3, audio: bool = True, video: bool = True) -> Path:
    args = ["ffmpeg", "-y"]
    if video:
        args += ["-f", "lavfi", "-i", f"testsrc=duration={duration}:size=640x480:rate=25"]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}"]
    if video:
        args += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "aac"]
    subprocess.run([*args, "-shortest", str(path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return path


def test_options_reject_unknown_format():
    with pytest.raises(ValueError):
        Options.from_dict({"format": "exe"})


def test_options_fall_back_to_known_values():
    opts = Options.from_dict({"format": "MP4", "quality": "ultra", "height": 999, "audioKbps": 1})
    assert (opts.format, opts.quality, opts.height, opts.audio_kbps) == ("mp4", "balanced", 0, 192)


def test_output_path_never_overwrites_source(tmp_path):
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"x")
    assert media_convert.output_path(src, tmp_path, "mp4").name == "clip_converted.mp4"
    assert media_convert.output_path(src, tmp_path, "mkv").name == "clip.mkv"


def test_clip_range():
    assert media_convert.clip_range(Options("mp4"), 10.0) == (0.0, 10.0)
    assert media_convert.clip_range(Options("mp4", start=2, end=5), 10.0) == (2, 3)
    start, length = media_convert.clip_range(Options("mp4", start=8, end=20), 10.0)
    assert (start, length) == (8, 2)


def test_video_bitrate_leaves_room_for_audio():
    kbps = media_convert.video_bitrate_kbps(10, 60, 128)
    assert kbps + 128 <= 10 * 8 * 1024 / 60
    assert media_convert.video_bitrate_kbps(1, 3600, 128) == media_convert.MIN_VIDEO_KBPS


def test_build_args_audio_only_drops_video():
    opts = Options("mp3", audio_kbps=256, normalize=True)
    args = media_convert.build_args("in.mp4", Path("out.mp3"), opts, {"hasAudio": True, "height": 480}, (0.0, 0.0))
    assert "-vn" in args and "libmp3lame" in args and "256k" in args
    assert media_convert.LOUDNORM in args


def test_build_args_does_not_upscale():
    info = {"hasAudio": False, "height": 480}
    args = media_convert.build_args("in.mp4", Path("o.mp4"), Options("mp4", height=1080), info, (0.0, 0.0))
    assert "-vf" not in args
    args = media_convert.build_args("in.mp4", Path("o.mp4"), Options("mp4", height=360), info, (0.0, 0.0))
    assert "scale=-2:360:flags=lanczos" in args


@needs_ffmpeg
def test_convert_video_trim_and_scale(tmp_path, ctx):
    src = _sample(tmp_path / "in.mp4", duration=4)
    out_dir = tmp_path / "out"
    result = media_convert.convert(ctx, {"paths": [str(src)], "outputDir": str(out_dir), "format": "webm",
                                         "height": 360, "start": 1, "end": 3})
    info = ffmpeg.probe_media(result["outPath"])
    assert info["height"] == 360 and info["hasAudio"]
    assert abs(info["duration"] - 2) < 0.3


@needs_ffmpeg
def test_convert_to_target_size(tmp_path, ctx):
    src = _sample(tmp_path / "in.mp4", duration=6)
    result = media_convert.convert(ctx, {"paths": [str(src)], "outputDir": str(tmp_path), "format": "mp4",
                                         "targetMb": 0.3})
    assert result["results"][0]["outBytes"] <= 0.3 * 1024 * 1024 * 1.05
    assert not list(media_convert.cache_dir().glob(f"ffmpeg2pass_{ctx.job_id or 'preview'}*"))


@needs_ffmpeg
def test_extract_audio_and_report_failures(tmp_path, ctx):
    good = _sample(tmp_path / "a.mp4", duration=2)
    silent = _sample(tmp_path / "b.mp4", duration=2, audio=False)
    result = media_convert.convert(ctx, {"paths": [str(good), str(silent)], "outputDir": str(tmp_path), "format": "mp3"})
    assert result["converted"] == 1 and result["failed"] == 1
    assert Path(result["files"][0]).suffix == ".mp3"
    assert not ffmpeg.probe_media(result["files"][0])["hasVideo"]


@needs_ffmpeg
def test_all_failed_raises(tmp_path, ctx):
    first = _sample(tmp_path / "a.m4a", duration=2, video=False)
    second = _sample(tmp_path / "b.m4a", duration=2, video=False)
    with pytest.raises(AppError) as err:
        media_convert.convert(ctx, {"paths": [str(first), str(second)], "outputDir": str(tmp_path), "format": "mp4"})
    assert err.value.key == "errors.allFilesFailed"


@needs_ffmpeg
def test_single_failed_file_reports_its_own_error(tmp_path, ctx):
    audio = _sample(tmp_path / "a.m4a", duration=2, video=False)
    with pytest.raises(AppError) as err:
        media_convert.convert(ctx, {"paths": [str(audio)], "outputDir": str(tmp_path), "format": "mp4"})
    assert err.value.key == "errors.noVideo"

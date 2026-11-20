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


VIDEO_INFO = {
    "hasVideo": True,
    "hasAudio": True,
    "duration": 10.0,
    "height": 720,
    "videoCodec": "h264",
    "videoIndex": 1,
    "hasCover": True,
    "audioTracks": [{"codec": "aac", "channels": 2}, {"codec": "dts", "channels": 6}],
    "subtitles": [{"index": 4, "codec": "subrip"}, {"index": 5, "codec": "hdmv_pgs_subtitle"}],
}


def _value(args, flag):
    return args[args.index(flag) + 1]


def _maps(args):
    return [args[i + 1] for i, arg in enumerate(args) if arg == "-map"]


def test_hevc_on_nvenc_gets_quality_and_hvc1_tag():
    args = media_convert.build_args("in.mkv", Path("o.mp4"), Options("mp4", codec="hevc", quality="high"), VIDEO_INFO,
                                    (0.0, 0.0), "hevc_nvenc")
    assert _value(args, "-c:v") == "hevc_nvenc"
    assert (_value(args, "-rc"), _value(args, "-cq"), _value(args, "-preset")) == ("vbr", "23", "p5")
    assert _value(args, "-tag:v") == "hvc1" and _value(args, "-pix_fmt") == "yuv420p"
    mkv = media_convert.build_args("in.mkv", Path("o.mkv"), Options("mkv", codec="hevc"), VIDEO_INFO, (0.0, 0.0), "hevc_nvenc")
    assert "-tag:v" not in mkv


def test_each_encoder_gets_its_own_quality_setting():
    def args(encoder, codec="h264"):
        return media_convert.build_args("in", Path("o.mkv"), Options("mkv", codec=codec), VIDEO_INFO, (0.0, 0.0), encoder)

    assert _value(args("h264_qsv"), "-global_quality") == "25" and _value(args("h264_qsv"), "-pix_fmt") == "nv12"
    amf = args("hevc_amf", "hevc")
    assert (_value(amf, "-rc"), _value(amf, "-qp_i"), _value(amf, "-qp_p")) == ("cqp", "26", "28")
    assert _value(args("libx265", "hevc"), "-crf") == "26"
    sized = media_convert.build_args("in", Path("o.mkv"), Options("mkv"), VIDEO_INFO, (0.0, 0.0), "h264_nvenc", 2000)
    assert _value(sized, "-b:v") == "2000k" and "-cq" not in sized


def test_unknown_codec_falls_back_to_the_container_default():
    assert Options.from_dict({"format": "webm", "codec": "hevc"}).video_codec == "vp9"
    assert Options.from_dict({"format": "mov", "codec": "av1"}).video_codec == "h264"
    assert Options.from_dict({"format": "mp4", "codec": "AV1"}).video_codec == "av1"
    assert not Options.from_dict({"format": "mp3", "copy": True}).copy


def test_every_sound_track_and_text_subtitles_are_kept_without_the_cover():
    args = media_convert.build_args("in.mkv", Path("o.mp4"), Options("mp4"), VIDEO_INFO, (0.0, 0.0), "libx264")
    assert _maps(args) == ["0:1", "0:a", "0:4"]
    assert _value(args, "-c:s") == "mov_text"
    assert (_value(args, "-b:a:0"), _value(args, "-b:a:1")) == ("128k", "384k")
    muted = media_convert.build_args("in.mkv", Path("o.mkv"), Options("mkv", mute=True), VIDEO_INFO, (0.0, 0.0), "libx264")
    assert _maps(muted) == ["0:1", "0:4", "0:5", "0:t?"]
    assert "-an" in muted


def test_container_change_encodes_only_the_sound_mp4_cannot_hold():
    info = {**VIDEO_INFO, "videoCodec": "hevc"}
    args = media_convert.build_args("in.mkv", Path("o.mp4"), Options("mp4", copy=True), info, (0.0, 0.0))
    assert _value(args, "-c:v") == "copy" and _value(args, "-tag:v") == "hvc1"
    assert _value(args, "-c:a:0") == "copy"
    assert _value(args, "-c:a:1") == "aac" and _value(args, "-b:a:1") == "384k"
    assert "-crf" not in args and "-vf" not in args


def test_copy_formats_follow_the_picture_codec(monkeypatch):
    codecs = {"a.mkv": "h264", "b.webm": "vp8", "c.mkv": "hevc"}
    monkeypatch.setattr(media_convert, "probe_media",
                        lambda path, thumbnail=True: {"hasVideo": path != "song.mp3", "videoCodec": codecs.get(path, "")})
    assert media_convert.copy_formats(["a.mkv"]) == ["mp4", "mkv", "mov"]
    assert media_convert.copy_formats(["a.mkv", "b.webm"]) == ["mkv"]
    assert media_convert.copy_formats(["b.webm"]) == ["mkv", "webm"]
    assert media_convert.copy_formats(["a.mkv", "song.mp3"]) == []


class _FakeFfmpeg:
    """Stands in for run_ffmpeg: records each command and writes an output of ``size(args)`` bytes."""

    def __init__(self, size=None, fail=None):
        self.calls = []
        self.size = size or (lambda args: 1000)
        self.fail = fail or (lambda args: False)
        self.invalidated = []

    def __call__(self, ctx, args, duration, out_path=None, **kwargs):
        self.calls.append(list(args))
        if self.fail(args):
            raise RuntimeError("ffmpeg failed: No capable devices found")
        if out_path is not None:
            Path(out_path).write_bytes(b"x" * self.size(args))

    def encoders(self):
        return [_value(args, "-c:v") for args in self.calls]


@pytest.fixture
def fake_run(monkeypatch, tmp_path):
    def install(card="h264_nvenc", info=None, size=None, fail=None):
        fake = _FakeFfmpeg(size, fail)
        monkeypatch.setattr(media_convert, "run_ffmpeg", fake)
        monkeypatch.setattr(media_convert, "probe_media", lambda path, thumbnail=True: info or VIDEO_INFO)
        monkeypatch.setattr(media_convert.encoders, "hardware_encoder", lambda codec: card)
        monkeypatch.setattr(media_convert.encoders, "invalidate", lambda: fake.invalidated.append(True))
        source = tmp_path / "film.mkv"
        source.write_bytes(b"source")
        return fake, source

    return install


def _logs(ctx):
    return [e["message"] for e in ctx.of("job:log")]


def test_picture_subtitles_in_mp4_are_skipped_and_counted(fake_run, ctx, tmp_path):
    fake, source = fake_run()
    result = media_convert.convert(ctx, {"paths": [str(source)], "outputDir": str(tmp_path / "out"), "format": "mp4"})
    assert result["subtitlesSkipped"] == 1 and result["encoders"] == ["h264_nvenc"]
    assert "media_convert.log.subtitlesSkipped" in _logs(ctx)
    assert "0:5" not in _maps(fake.calls[0])


def test_too_big_file_on_the_card_is_encoded_once_more_at_a_lower_bitrate(fake_run, ctx, tmp_path):
    limit = 1024 * 1024
    sizes = iter([limit + 1, limit - 1])
    fake, source = fake_run(size=lambda args: next(sizes))
    result = media_convert.convert(ctx, {"paths": [str(source)], "outputDir": str(tmp_path), "format": "mp4", "targetMb": 1})
    assert fake.encoders() == ["h264_nvenc", "h264_nvenc"]
    first, second = (int(_value(args, "-b:v")[:-1]) for args in fake.calls)
    assert second < first
    assert result["encoders"] == ["h264_nvenc"] and "media_convert.log.refit" in _logs(ctx)


def test_still_too_big_falls_back_to_two_passes_on_the_processor(fake_run, ctx, tmp_path):
    limit = 1024 * 1024
    fake, source = fake_run(size=lambda args: limit * 2 if "h264_nvenc" in args else limit // 2)
    result = media_convert.convert(ctx, {"paths": [str(source)], "outputDir": str(tmp_path), "format": "mp4", "targetMb": 1})
    assert fake.encoders() == ["h264_nvenc", "h264_nvenc", "libx264", "libx264"]
    assert [_value(args, "-pass") for args in fake.calls[2:]] == ["1", "2"]
    assert result["encoders"] == ["libx264"] and result["results"][0]["outBytes"] <= limit
    assert "media_convert.log.sizeFallback" in _logs(ctx)


def test_failed_card_encode_is_redone_on_the_processor(fake_run, ctx, tmp_path):
    fake, source = fake_run(card="hevc_nvenc", fail=lambda args: "hevc_nvenc" in args)
    result = media_convert.convert(ctx, {"paths": [str(source)], "outputDir": str(tmp_path), "format": "mkv", "codec": "hevc"})
    assert fake.encoders() == ["hevc_nvenc", "libx265"]
    assert result["encoders"] == ["libx265"] and fake.invalidated
    warning = next(e for e in ctx.of("job:log") if e["message"] == "media_convert.log.cardFailed")
    assert warning["level"] == "warning" and warning["params"]["encoder"] == "hevc_nvenc"


def test_hardware_off_uses_the_processor(fake_run, ctx, tmp_path):
    fake, source = fake_run()
    media_convert.convert(ctx, {"paths": [str(source)], "outputDir": str(tmp_path), "format": "mp4"}, hardware=False)
    assert fake.encoders() == ["libx264"]


def test_copy_refuses_a_picture_the_container_cannot_hold(fake_run, ctx, tmp_path):
    fake, source = fake_run(info={**VIDEO_INFO, "videoCodec": "vp8"})
    with pytest.raises(AppError) as err:
        media_convert.convert(ctx, {"paths": [str(source)], "outputDir": str(tmp_path), "format": "mp4", "copy": True})
    assert err.value.key == "errors.copyUnsupported" and not fake.calls


def _film_with_two_tracks_and_subtitles(tmp_path: Path) -> Path:
    srt = tmp_path / "subs.srt"
    srt.write_text("1\n00:00:00,500 --> 00:00:01,500\nZażółć\n", encoding="utf-8")
    film = tmp_path / "film.mkv"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=25",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-f", "lavfi", "-i", "sine=frequency=660:duration=2",
        "-i", str(srt),
        "-map", "0", "-map", "1", "-map", "2", "-map", "3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:s", "srt",
        str(film),
    ], check=True)
    return film


@needs_ffmpeg
def test_container_change_keeps_every_track_and_ignores_trim(tmp_path, ctx):
    film = _film_with_two_tracks_and_subtitles(tmp_path)
    result = media_convert.convert(ctx, {"paths": [str(film)], "outputDir": str(tmp_path / "out"), "format": "mp4",
                                         "copy": True, "start": 0.5, "end": 1})
    info = ffmpeg.probe_media(result["outPath"])
    assert result["encoders"] == ["copy"] and info["videoCodec"] == "h264"
    assert len(info["audioTracks"]) == 2 and [s["codec"] for s in info["subtitles"]] == ["mov_text"]
    assert info["duration"] == pytest.approx(2.0, abs=0.2)


def _nvenc_available() -> bool:
    return ffmpeg.has_binary("ffmpeg") and media_convert.encoders.hardware_encoder("hevc") == "hevc_nvenc"


@pytest.mark.skipif(not _nvenc_available(), reason="NVENC not available")
def test_real_nvenc_hevc_keeps_tracks_and_tag(tmp_path, ctx):
    film = _film_with_two_tracks_and_subtitles(tmp_path)
    result = media_convert.convert(ctx, {"paths": [str(film)], "outputDir": str(tmp_path / "out"), "format": "mp4",
                                         "codec": "hevc"})
    assert result["encoders"] == ["hevc_nvenc"]
    info = ffmpeg.probe_media(result["outPath"])
    assert info["videoCodec"] == "hevc" and len(info["audioTracks"]) == 2
    assert [s["codec"] for s in info["subtitles"]] == ["mov_text"]
    tag = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_tag_string",
                          "-of", "csv=p=0", result["outPath"]], capture_output=True, text=True).stdout.strip()
    assert tag == "hvc1"

"""Video and audio conversion with ffmpeg: change the format, compress by quality or to a target
size, trim, scale down, drop or keep only the sound, even out loudness, or only change the container.

Video is encoded on the graphics card when one works (NVENC, Quick Sync or AMF, see
``core.encoders``) and on the processor otherwise. A failed encode on the card is redone on the
processor. The picture, every sound track and the subtitles the container can hold are kept; a cover
image is not. HDR is not kept.
"""

import logging
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, Optional, Tuple

from backend.core import encoders
from backend.core.errors import AppError, MissingFile, describe
from backend.core.ffmpeg import probe_media, run_ffmpeg, subtitle_args
from backend.core.jobs import JobContext
from backend.core.paths import cache_dir, unique_path

logger = logging.getLogger(__name__)

VIDEO_FORMATS = ("mp4", "mkv", "mov", "webm")
AUDIO_FORMATS = ("mp3", "m4a", "ogg", "opus", "wav", "flac")
LOSSLESS_AUDIO = ("wav", "flac")
QUALITIES = ("high", "balanced", "small")
HEIGHTS = (0, 2160, 1440, 1080, 720, 480, 360)
AUDIO_BITRATES = (96, 128, 160, 192, 256, 320)

# Video codecs each container can be encoded to; the first one is the default.
ENCODE_CODECS: Dict[str, Tuple[str, ...]] = {
    "mp4": ("h264", "hevc", "av1"),
    "mkv": ("h264", "hevc", "av1"),
    "mov": ("h264", "hevc"),
    "webm": ("vp9", "av1"),
}
CPU_ENCODERS = {"h264": "libx264", "hevc": "libx265", "av1": "libaom-av1", "vp9": "libvpx-vp9"}
CPU_SPEED = {
    "libx264": ["-preset", "medium"],
    "libx265": ["-preset", "medium"],
    "libaom-av1": ["-cpu-used", "6", "-row-mt", "1"],
    "libvpx-vp9": ["-row-mt", "1", "-deadline", "good", "-cpu-used", "4"],
}
# Quality value per level (high, balanced, small): CRF on the processor, -cq for NVENC,
# global_quality for Quick Sync, the I-frame QP for AMF. Lower is better and bigger; AV1 on
# Quick Sync and AMF counts on a 0–255 scale.
QUALITY_VALUES: Dict[str, Tuple[int, int, int]] = {
    "libx264": (20, 24, 29),
    "libx265": (22, 26, 31),
    "libaom-av1": (28, 34, 42),
    "libvpx-vp9": (28, 33, 38),
    "h264_nvenc": (21, 25, 30),
    "hevc_nvenc": (23, 27, 32),
    "av1_nvenc": (27, 33, 40),
    "h264_qsv": (21, 25, 30),
    "hevc_qsv": (22, 26, 31),
    "av1_qsv": (90, 120, 150),
    "h264_amf": (20, 24, 29),
    "hevc_amf": (22, 26, 31),
    "av1_amf": (90, 120, 150),
}
# Codecs a container takes without encoding; None takes anything.
COPY_VIDEO: Dict[str, Optional[FrozenSet[str]]] = {
    "mp4": frozenset({"h264", "hevc", "av1", "mpeg4", "vp9"}),
    "mkv": None,
    "mov": frozenset({"h264", "hevc", "mpeg4", "prores", "mjpeg"}),
    "webm": frozenset({"vp8", "vp9", "av1"}),
}
COPY_AUDIO: Dict[str, Optional[FrozenSet[str]]] = {
    "mp4": frozenset({"aac", "mp3", "ac3", "eac3", "opus", "flac", "alac"}),
    "mkv": None,
    "mov": frozenset({"aac", "mp3", "alac", "ac3", "eac3", "pcm_s16le", "pcm_s24le"}),
    "webm": frozenset({"opus", "vorbis"}),
}

VIDEO_AUDIO_KBPS = 128
MIN_VIDEO_KBPS = 50
# Bitrate kept free for container overhead when fitting a size.
SIZE_MARGIN = 0.96
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
OPUS_LAYOUTS = "aformat=channel_layouts=7.1|5.1|5.0|quad|stereo|mono"

AUDIO_CODECS = {
    "mp3": ["-c:a", "libmp3lame"],
    "m4a": ["-c:a", "aac"],
    "ogg": ["-c:a", "libvorbis"],
    "opus": ["-c:a", "libopus"],
    "wav": ["-c:a", "pcm_s16le"],
    "flac": ["-c:a", "flac"],
}


@dataclass(frozen=True)
class Options:
    format: str
    quality: str = "balanced"
    target_mb: float = 0.0
    height: int = 0
    mute: bool = False
    audio_kbps: int = 192
    normalize: bool = False
    start: float = 0.0
    end: float = 0.0
    codec: str = ""
    copy: bool = False

    @property
    def is_video(self) -> bool:
        return self.format in VIDEO_FORMATS

    @property
    def video_codec(self) -> str:
        allowed = ENCODE_CODECS.get(self.format, ())
        return self.codec if self.codec in allowed else (allowed[0] if allowed else "")

    @staticmethod
    def from_dict(params: Dict[str, Any]) -> "Options":
        fmt = str(params.get("format", "mp4")).lower()
        if fmt not in VIDEO_FORMATS + AUDIO_FORMATS:
            raise ValueError(f"Unsupported output format: {fmt}")
        quality = params.get("quality", "balanced")
        height = int(params.get("height") or 0)
        kbps = int(params.get("audioKbps") or 192)
        codec = str(params.get("codec") or "").lower()
        return Options(
            format=fmt,
            quality=quality if quality in QUALITIES else "balanced",
            target_mb=max(0.0, float(params.get("targetMb") or 0)),
            height=height if height in HEIGHTS else 0,
            mute=bool(params.get("mute", False)),
            audio_kbps=kbps if kbps in AUDIO_BITRATES else 192,
            normalize=bool(params.get("normalize", False)),
            start=max(0.0, float(params.get("start") or 0)),
            end=max(0.0, float(params.get("end") or 0)),
            codec=codec if codec in ENCODE_CODECS.get(fmt, ()) else "",
            copy=bool(params.get("copy", False)) and fmt in VIDEO_FORMATS,
        )


def output_path(source: Path, out_dir: Path, fmt: str, taken: Optional[set] = None) -> Path:
    """``<name>.<format>`` in ``out_dir``; never the source itself, never an existing file."""
    target = out_dir / f"{source.stem}.{fmt}"
    if target.resolve() == source.resolve():
        target = out_dir / f"{source.stem}_converted.{fmt}"
    return unique_path(target, taken)


def clip_range(opts: Options, duration: float) -> tuple:
    """Start and length in seconds; the whole file when no trim is set."""
    start = min(opts.start, max(0.0, duration - 0.05))
    end = opts.end if opts.end > start else duration
    end = min(end, duration) if duration > 0 else end
    return start, max(0.05, end - start) if end else 0.0


def video_bitrate_kbps(target_mb: float, seconds: float, audio_kbps: int) -> int:
    """Video bitrate that makes ``seconds`` of video with ``audio_kbps`` sound fit ``target_mb``."""
    total_kbps = target_mb * 8 * 1024 * SIZE_MARGIN / max(seconds, 0.1)
    return max(MIN_VIDEO_KBPS, int(total_kbps - audio_kbps))


def refit_bitrate_kbps(kbps: int, size_bytes: int, target_mb: float, seconds: float, audio_kbps: int) -> int:
    """A lower video bitrate after an encode at ``kbps`` came out ``size_bytes`` big."""
    seconds = max(seconds, 0.1)
    allowed = target_mb * 1024 * 1024 * SIZE_MARGIN * 8 / 1000 / seconds - audio_kbps
    actual = size_bytes * 8 / 1000 / seconds - audio_kbps
    scaled = int(kbps * allowed / max(actual, 1.0))
    return max(MIN_VIDEO_KBPS, min(scaled, int(kbps * 0.95)))


def track_kbps(track: Dict[str, Any]) -> int:
    """Bitrate for one re-encoded sound track: 128 kb/s for stereo, more for surround."""
    return max(VIDEO_AUDIO_KBPS, 64 * int(track.get("channels") or 2))


def _audio_tracks(info: Dict[str, Any]) -> List[Dict[str, Any]]:
    tracks = info.get("audioTracks") or []
    return tracks or ([{"codec": "", "channels": 2}] if info.get("hasAudio") else [])


def _audio_total_kbps(opts: Options, info: Dict[str, Any]) -> int:
    return 0 if opts.mute else sum(track_kbps(t) for t in _audio_tracks(info))


def copyable_audio(fmt: str, track: Dict[str, Any]) -> bool:
    allowed = COPY_AUDIO.get(fmt)
    return allowed is None or track.get("codec") in allowed


def copyable_video(fmt: str, codec: str) -> bool:
    allowed = COPY_VIDEO.get(fmt)
    return bool(codec) and (allowed is None or codec in allowed)


def copy_formats(paths: List[str]) -> List[str]:
    """Video containers every file's picture can be copied into without encoding."""
    codecs = set()
    for path in paths:
        info = probe_media(path, thumbnail=False)
        if not info.get("hasVideo"):
            return []
        codecs.add(info.get("videoCodec") or "")
    if not codecs:
        return []
    return [fmt for fmt in VIDEO_FORMATS if all(copyable_video(fmt, codec) for codec in codecs)]


def _vendor(encoder: str) -> str:
    return encoder.rsplit("_", 1)[-1] if encoder.endswith(tuple(f"_{v}" for v in encoders.VENDORS)) else "cpu"


def _scale_filter(height: int, source_height: int) -> Optional[str]:
    if not height or not source_height or height >= source_height:
        return None
    return f"scale=-2:{height}:flags=lanczos"


def _audio_args(opts: Options, has_audio: bool) -> List[str]:
    if not has_audio:
        return ["-an"]
    args: List[str] = []
    if opts.normalize:
        args += ["-af", LOUDNORM]
    args += AUDIO_CODECS[opts.format]
    if opts.format not in LOSSLESS_AUDIO:
        args += ["-b:a", f"{opts.audio_kbps}k"]
    return args


def _video_audio_args(opts: Options, tracks: List[Dict[str, Any]]) -> List[str]:
    """Codec per sound track of a video: copied when the container takes it in copy mode, else encoded.

    Opus takes surround sound only in the standard channel layouts, so other layouts are converted.
    """
    encoder = "libopus" if opts.format == "webm" else "aac"
    args: List[str] = []
    if opts.normalize and not opts.copy:
        args += ["-ar", "48000"]
    for i, track in enumerate(tracks):
        if opts.copy and copyable_audio(opts.format, track):
            args += [f"-c:a:{i}", "copy"]
            continue
        filters = [LOUDNORM] if opts.normalize and not opts.copy else []
        if encoder == "libopus" and int(track.get("channels") or 2) > 2:
            filters.append(OPUS_LAYOUTS)
        if filters:
            args += [f"-filter:a:{i}", ",".join(filters)]
        args += [f"-c:a:{i}", encoder, f"-b:a:{i}", f"{track_kbps(track)}k"]
    return args


def _video_codec_args(encoder: str, opts: Options, video_kbps: int) -> List[str]:
    """Encoder, speed and quality (or bitrate) arguments for one of the video encoders."""
    args = ["-c:v", encoder]
    vendor = _vendor(encoder)
    q = QUALITY_VALUES[encoder][QUALITIES.index(opts.quality)]
    bitrate = ["-b:v", f"{video_kbps}k", "-maxrate", f"{int(video_kbps * 1.5)}k", "-bufsize", f"{video_kbps * 2}k"]
    if vendor == "nvenc":
        args += ["-preset", "p5", "-rc", "vbr"] + (bitrate if video_kbps else ["-cq", str(q), "-b:v", "0"])
    elif vendor == "qsv":
        args += ["-preset", "medium"] + (bitrate if video_kbps else ["-global_quality", str(q)])
    elif vendor == "amf":
        args += ["-quality", "balanced"]
        if video_kbps:
            args += ["-rc", "vbr_peak"] + bitrate
        else:
            args += ["-rc", "cqp", "-qp_i", str(q), "-qp_p", str(q + 2)]
            if encoder == "h264_amf":
                args += ["-qp_b", str(q + 4)]
    else:
        args += CPU_SPEED[encoder]
        if video_kbps:
            args += bitrate
        elif encoder in ("libaom-av1", "libvpx-vp9"):
            args += ["-crf", str(q), "-b:v", "0"]
        else:
            args += ["-crf", str(q)]
    return args + ["-pix_fmt", encoders.pixel_format(encoder)]


def _container_args(fmt: str) -> List[str]:
    if fmt in ("mp4", "mov", "m4a"):
        return ["-movflags", "+faststart"]
    return []


def build_args(
    source: str,
    out_path: Path,
    opts: Options,
    info: Dict[str, Any],
    clip: tuple,
    encoder: str = "",
    video_kbps: int = 0,
    pass_number: int = 0,
    pass_log: str = "",
) -> List[str]:
    """ffmpeg arguments for one file; ``pass_number`` 1 or 2 for a two-pass size fit."""
    start, length = clip
    args: List[str] = []
    if start > 0:
        args += ["-ss", f"{start:.3f}"]
    if length:
        args += ["-t", f"{length:.3f}"]
    args += ["-i", source]
    if not opts.is_video:
        args += ["-map", "0:a:0", "-map_metadata", "0", "-vn"]
        args += _audio_args(opts, bool(info.get("hasAudio")))
        return args + _container_args(opts.format) + [str(out_path)]

    video_index = int(info.get("videoIndex", -1))
    args += ["-map", f"0:{video_index}" if video_index >= 0 else "0:v:0"]
    tracks = [] if opts.mute or pass_number == 1 else _audio_tracks(info)
    if tracks:
        args += ["-map", "0:a"]
    if pass_number != 1:
        args += subtitle_args(info.get("subtitles") or [], out_path.suffix)[0]
        if opts.format == "mkv":
            args += ["-map", "0:t?"]
    args += ["-map_metadata", "0"]

    if opts.copy:
        args += ["-c:v", "copy"]
        codec = str(info.get("videoCodec") or "")
    else:
        codec = opts.video_codec
        scale = _scale_filter(opts.height, int(info.get("height") or 0))
        if scale:
            args += ["-vf", scale]
        args += _video_codec_args(encoder or CPU_ENCODERS[codec], opts, video_kbps)
        if pass_number:
            args += ["-pass", str(pass_number), "-passlogfile", pass_log]
    if pass_number == 1:
        return args + ["-an", "-sn", "-f", "null", "NUL"]
    if codec == "hevc" and opts.format in ("mp4", "mov"):
        args += ["-tag:v", "hvc1"]
    args += _video_audio_args(opts, tracks) if tracks else ["-an"]
    return args + _container_args(opts.format) + [str(out_path)]


def _encode_on_card(
    ctx: JobContext, encoder: str, source: Path, out_path: Path, opts: Options, info: Dict[str, Any],
    clip: tuple, seconds: float, progress_start: float, progress_span: float,
) -> bool:
    """One encode on the card; for a target size, at most one more at a lower bitrate. False when too big."""
    status = "media_convert.status.converting"
    if not opts.target_mb:
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, encoder), seconds, out_path=out_path,
                   progress_start=progress_start, progress_span=progress_span, status_key=status)
        return True
    limit = opts.target_mb * 1024 * 1024
    audio_kbps = _audio_total_kbps(opts, info)
    kbps = video_bitrate_kbps(opts.target_mb, seconds, audio_kbps)
    for attempt in range(2):
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, encoder, kbps), seconds, out_path=out_path,
                   progress_start=progress_start, progress_span=progress_span,
                   status_key=status if attempt == 0 else "media_convert.status.refitting")
        size = out_path.stat().st_size
        if size <= limit:
            return True
        out_path.unlink()
        if attempt == 0:
            kbps = refit_bitrate_kbps(kbps, size, opts.target_mb, seconds, audio_kbps)
            ctx.log("media_convert.log.refit", file=source.name)
    return False


def _encode_on_cpu(
    ctx: JobContext, encoder: str, source: Path, out_path: Path, opts: Options, info: Dict[str, Any],
    clip: tuple, seconds: float, progress_start: float, progress_span: float,
) -> None:
    """One pass by quality, or two passes for a target size."""
    status = "media_convert.status.converting"
    if not opts.target_mb:
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, encoder), seconds, out_path=out_path,
                   progress_start=progress_start, progress_span=progress_span, status_key=status)
        return
    kbps = video_bitrate_kbps(opts.target_mb, seconds, _audio_total_kbps(opts, info))
    pass_log = str(cache_dir() / f"ffmpeg2pass_{ctx.job_id or 'preview'}")
    half = progress_span / 2
    try:
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, encoder, kbps, 1, pass_log), seconds,
                   progress_start=progress_start, progress_span=half, status_key="media_convert.status.analyzing")
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, encoder, kbps, 2, pass_log), seconds,
                   out_path=out_path, progress_start=progress_start + half, progress_span=half, status_key=status)
    finally:
        for leftover in cache_dir().glob(f"{Path(pass_log).name}*"):
            leftover.unlink(missing_ok=True)


def _encode_video(
    ctx: JobContext, source: Path, out_path: Path, opts: Options, info: Dict[str, Any],
    clip: tuple, seconds: float, progress_start: float, progress_span: float, hardware: bool,
) -> str:
    """Encodes the picture on the card when one works, else (or after a failure) on the processor."""
    codec = opts.video_codec
    cpu = CPU_ENCODERS[codec]
    card = encoders.hardware_encoder(codec) if hardware and codec in encoders.CODECS else None
    job = (source, out_path, opts, info, clip, seconds, progress_start, progress_span)
    if card:
        ctx.log("media_convert.log.encoder", file=source.name, encoder=card)
        try:
            fits = _encode_on_card(ctx, card, *job)
        except RuntimeError as exc:
            ctx.check_cancelled()
            logger.warning("%s failed on %s, encoding on the processor: %s", card, source.name, exc)
            ctx.log("media_convert.log.cardFailed", "warning", file=source.name, encoder=card, error=describe(exc))
            encoders.invalidate()
        else:
            if fits:
                return card
            ctx.log("media_convert.log.sizeFallback", "warning", file=source.name)
    ctx.log("media_convert.log.encoder", file=source.name, encoder=cpu)
    _encode_on_cpu(ctx, cpu, *job)
    return cpu


def convert_file(
    ctx: JobContext, source: Path, out_path: Path, opts: Options, progress_start: float, progress_span: float,
    hardware: bool = True,
) -> Dict[str, Any]:
    """Converts one file; returns ``{"encoder", "subtitlesSkipped"}`` (encoder "copy" in copy mode, "" for audio)."""
    info = probe_media(str(source), thumbnail=False)
    if opts.is_video and not info.get("hasVideo"):
        raise AppError("errors.noVideo", file=source.name)
    if not opts.is_video and not info.get("hasAudio"):
        raise AppError("errors.noAudio", file=source.name)
    if opts.copy and not copyable_video(opts.format, str(info.get("videoCodec") or "")):
        raise AppError("errors.copyUnsupported", file=source.name, format=opts.format.upper())
    clip = (0.0, 0.0) if opts.copy else clip_range(opts, float(info.get("duration") or 0))
    seconds = clip[1] or float(info.get("duration") or 0)

    skipped = subtitle_args(info.get("subtitles") or [], out_path.suffix)[1] if opts.is_video else 0
    if skipped:
        ctx.log("media_convert.log.subtitlesSkipped", "warning", count=skipped, format=opts.format.upper())
    if opts.is_video and not opts.copy and info.get("hdr"):
        ctx.log("media_convert.log.hdrLost", "warning", file=source.name)

    if opts.is_video and not opts.copy:
        encoder = _encode_video(ctx, source, out_path, opts, info, clip, seconds, progress_start, progress_span, hardware)
        return {"encoder": encoder, "subtitlesSkipped": skipped}

    if opts.copy and not opts.mute:
        reencoded = sum(1 for track in _audio_tracks(info) if not copyable_audio(opts.format, track))
        if reencoded:
            ctx.log("media_convert.log.audioReencoded", count=reencoded, format=opts.format.upper())
    run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip), seconds, out_path=out_path,
               progress_start=progress_start, progress_span=progress_span, status_key="media_convert.status.converting")
    return {"encoder": "copy" if opts.copy else "", "subtitlesSkipped": skipped}


def convert(ctx: JobContext, params: Dict[str, Any], hardware: bool = True) -> Dict[str, Any]:
    paths = [Path(p) for p in params.get("paths") or []]
    if not paths:
        raise ValueError("No files to convert")
    opts = Options.from_dict(params)
    if len(paths) > 1 or opts.copy:
        opts = replace(opts, start=0.0, end=0.0)
    out_dir = Path(params["outputDir"])
    out_dir.mkdir(parents=True, exist_ok=True)

    results: List[Dict[str, Any]] = []
    failed = 0
    last_error: Optional[Exception] = None
    taken: set = set()
    span = 100 / len(paths)
    ctx.progress(0, "media_convert.status.converting")
    for i, source in enumerate(paths):
        ctx.check_cancelled()
        try:
            if not source.is_file():
                raise MissingFile(source)
            out_path = output_path(source, out_dir, opts.format, taken)
            taken.add(out_path)
            ctx.log("media_convert.log.starting", file=source.name, format=opts.format.upper())
            outcome = convert_file(ctx, source, out_path, opts, i * span, span, hardware)
            item = {"file": str(source), "dest": str(out_path), "inBytes": source.stat().st_size,
                    "outBytes": out_path.stat().st_size, **outcome}
            results.append(item)
            ctx.partial(item)
            ctx.log("media_convert.log.done", file=out_path.name)
        except Exception as exc:  # noqa: BLE001
            if ctx.cancelled:
                raise
            failed += 1
            last_error = exc
            ctx.log("media_convert.log.error", "error", file=source.name, error=describe(exc))

    ctx.progress(100, "media_convert.status.done")
    if not results and failed:
        if len(paths) == 1 and last_error is not None:
            raise last_error
        raise AppError("errors.allFilesFailed", count=failed)
    used = list(dict.fromkeys(r["encoder"] for r in results if r["encoder"]))
    return {
        "total": len(paths),
        "converted": len(results),
        "failed": failed,
        "inBytes": sum(r["inBytes"] for r in results),
        "outBytes": sum(r["outBytes"] for r in results),
        "outputDir": str(out_dir),
        "outPath": results[0]["dest"] if len(results) == 1 else None,
        "files": [r["dest"] for r in results],
        "encoders": used,
        "subtitlesSkipped": sum(r["subtitlesSkipped"] for r in results),
        "results": results,
    }

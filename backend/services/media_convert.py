"""Video and audio conversion with ffmpeg: change the format, compress by quality or to a target
size (two-pass), trim, scale down, drop or keep only the sound, and even out loudness."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core.errors import AppError, MissingFile, describe
from backend.core.ffmpeg import probe_media, run_ffmpeg
from backend.core.jobs import JobContext
from backend.core.paths import cache_dir, unique_path

VIDEO_FORMATS = ("mp4", "mkv", "mov", "webm")
AUDIO_FORMATS = ("mp3", "m4a", "ogg", "opus", "wav", "flac")
LOSSLESS_AUDIO = ("wav", "flac")
QUALITIES = ("high", "balanced", "small")
HEIGHTS = (0, 2160, 1440, 1080, 720, 480, 360)
AUDIO_BITRATES = (96, 128, 160, 192, 256, 320)

# Constant rate factor per quality: lower is better and bigger.
X264_CRF = {"high": 20, "balanced": 24, "small": 29}
VP9_CRF = {"high": 28, "balanced": 33, "small": 38}
VIDEO_AUDIO_KBPS = 128
MIN_VIDEO_KBPS = 50
# Bitrate kept free for container overhead when fitting a size.
SIZE_MARGIN = 0.96
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"

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

    @property
    def is_video(self) -> bool:
        return self.format in VIDEO_FORMATS

    @staticmethod
    def from_dict(params: Dict[str, Any]) -> "Options":
        fmt = str(params.get("format", "mp4")).lower()
        if fmt not in VIDEO_FORMATS + AUDIO_FORMATS:
            raise ValueError(f"Unsupported output format: {fmt}")
        quality = params.get("quality", "balanced")
        height = int(params.get("height") or 0)
        kbps = int(params.get("audioKbps") or 192)
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


def _scale_filter(height: int, source_height: int) -> Optional[str]:
    if not height or not source_height or height >= source_height:
        return None
    return f"scale=-2:{height}:flags=lanczos"


def _audio_args(opts: Options, has_audio: bool) -> List[str]:
    if not has_audio or (opts.is_video and opts.mute):
        return ["-an"]
    args: List[str] = []
    if opts.normalize:
        args += ["-af", LOUDNORM]
    if opts.is_video:
        if opts.format == "webm":
            return args + ["-c:a", "libopus", "-b:a", f"{VIDEO_AUDIO_KBPS}k"]
        return args + ["-c:a", "aac", "-b:a", f"{VIDEO_AUDIO_KBPS}k"]
    args += AUDIO_CODECS[opts.format]
    if opts.format not in LOSSLESS_AUDIO:
        args += ["-b:a", f"{opts.audio_kbps}k"]
    return args


def _video_codec(opts: Options) -> List[str]:
    if opts.format == "webm":
        return ["-c:v", "libvpx-vp9", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"]
    return ["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p"]


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
    args += ["-i", source, "-map", "0:v:0?" if opts.is_video else "0:a:0", "-map_metadata", "0"]
    if opts.is_video and info.get("hasAudio") and not opts.mute:
        args += ["-map", "0:a:0"]
    if not opts.is_video:
        args += ["-vn"]
    else:
        scale = _scale_filter(opts.height, int(info.get("height") or 0))
        if scale:
            args += ["-vf", scale]
        args += _video_codec(opts)
        if video_kbps:
            args += ["-b:v", f"{video_kbps}k", "-maxrate", f"{int(video_kbps * 1.5)}k", "-bufsize", f"{video_kbps * 2}k"]
        elif opts.format == "webm":
            args += ["-crf", str(VP9_CRF[opts.quality]), "-b:v", "0"]
        else:
            args += ["-crf", str(X264_CRF[opts.quality])]
        if pass_number:
            args += ["-pass", str(pass_number), "-passlogfile", pass_log]
    if pass_number == 1:
        return args + ["-an", "-f", "null", "NUL"]
    args += _audio_args(opts, bool(info.get("hasAudio")))
    args += _container_args(opts.format)
    return args + [str(out_path)]


def convert_file(ctx: JobContext, source: Path, out_path: Path, opts: Options, progress_start: float, progress_span: float) -> None:
    info = probe_media(str(source))
    if opts.is_video and not info.get("hasVideo"):
        raise AppError("errors.noVideo", file=source.name)
    if not opts.is_video and not info.get("hasAudio"):
        raise AppError("errors.noAudio", file=source.name)
    clip = clip_range(opts, float(info.get("duration") or 0))
    seconds = clip[1] or float(info.get("duration") or 0)
    status = "media_convert.status.converting"

    if not (opts.is_video and opts.target_mb):
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip), seconds, out_path=out_path,
                   progress_start=progress_start, progress_span=progress_span, status_key=status)
        return

    audio_kbps = 0 if opts.mute or not info.get("hasAudio") else VIDEO_AUDIO_KBPS
    kbps = video_bitrate_kbps(opts.target_mb, seconds, audio_kbps)
    pass_log = str(cache_dir() / f"ffmpeg2pass_{ctx.job_id or 'preview'}")
    half = progress_span / 2
    try:
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, kbps, 1, pass_log), seconds,
                   progress_start=progress_start, progress_span=half, status_key="media_convert.status.analyzing")
        run_ffmpeg(ctx, build_args(str(source), out_path, opts, info, clip, kbps, 2, pass_log), seconds,
                   out_path=out_path, progress_start=progress_start + half, progress_span=half, status_key=status)
    finally:
        for leftover in cache_dir().glob(f"{Path(pass_log).name}*"):
            leftover.unlink(missing_ok=True)


def convert(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    paths = [Path(p) for p in params.get("paths") or []]
    if not paths:
        raise ValueError("No files to convert")
    opts = Options.from_dict(params)
    if len(paths) > 1:
        opts = Options(**{**opts.__dict__, "start": 0.0, "end": 0.0})
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
            convert_file(ctx, source, out_path, opts, i * span, span)
            item = {"file": str(source), "dest": str(out_path), "inBytes": source.stat().st_size,
                    "outBytes": out_path.stat().st_size}
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
    return {
        "total": len(paths),
        "converted": len(results),
        "failed": failed,
        "inBytes": sum(r["inBytes"] for r in results),
        "outBytes": sum(r["outBytes"] for r in results),
        "outputDir": str(out_dir),
        "outPath": results[0]["dest"] if len(results) == 1 else None,
        "files": [r["dest"] for r in results],
        "results": results,
    }

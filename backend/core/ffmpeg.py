"""Shared helpers for the external command-line tools (ffmpeg, ffprobe, gifsicle).

``run_process`` runs a tool as part of a job: it drains stderr on a thread (a full pipe
would block the tool), terminates it on cancel and removes the partial output.
``run_ffmpeg`` adds real progress from ffmpeg's ``-progress`` output.
"""

import base64
import json
import logging
import os
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Union

from backend.core.errors import AppError, MissingFile
from backend.core import deps
from backend.core.jobs import JobContext

logger = logging.getLogger(__name__)

NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def resolve_binary(name: str) -> str:
    """Finds a binary on PATH after ensuring the custom and app data bin folders are registered."""
    deps.ensure_app_paths()
    path = shutil.which(name)
    if not path:
        raise AppError("errors.binaryMissing", name=name)
    return path


def has_binary(name: str) -> bool:
    deps.ensure_app_paths()
    return shutil.which(name) is not None


def run_capture(cmd: Sequence[str], timeout: float) -> subprocess.CompletedProcess:
    """Runs a short command synchronously and returns its captured output."""
    return subprocess.run(
        list(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        creationflags=NO_WINDOW,
    )


def _remove(path: Optional[Path]) -> None:
    if path is not None and path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


def run_process(
    ctx: JobContext,
    cmd: Sequence[str],
    out_path: Optional[Path] = None,
    on_line: Optional[Callable[[str], None]] = None,
) -> None:
    """Runs ``cmd`` to completion, feeding each stdout line to ``on_line``.

    Raises ``JobCancelled`` when the job was cancelled and ``RuntimeError`` with the tail of
    stderr when the tool fails. The partial ``out_path`` is removed in both cases.
    """
    proc = subprocess.Popen(
        list(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=NO_WINDOW,
    )
    stderr_lines: List[str] = []
    finished = threading.Event()

    def drain_stderr() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            stderr_lines.append(line.rstrip())
            del stderr_lines[:-40]

    def watch_cancel() -> None:
        while not finished.wait(0.2):
            if ctx.cancelled:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return

    readers = [threading.Thread(target=drain_stderr, daemon=True), threading.Thread(target=watch_cancel, daemon=True)]
    for thread in readers:
        thread.start()

    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            if on_line is not None:
                on_line(line.strip())
        proc.wait()
    except BaseException:
        proc.kill()
        proc.wait()
        _remove(out_path)
        raise
    finally:
        finished.set()
        for thread in readers:
            thread.join(timeout=2)

    if ctx.cancelled:
        _remove(out_path)
        ctx.check_cancelled()
    if proc.returncode != 0:
        _remove(out_path)
        tail = "\n".join(stderr_lines[-8:])
        logger.error("%s failed (%s): %s", Path(cmd[0]).name, proc.returncode, tail)
        raise RuntimeError(f"{Path(cmd[0]).stem} failed: {tail or proc.returncode}")


def same_file(a: Union[str, Path], b: Union[str, Path]) -> bool:
    """Whether two paths name the same file (case-insensitive on Windows)."""
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def run_ffmpeg(
    ctx: JobContext,
    args: Sequence[str],
    duration: float,
    out_path: Optional[Path] = None,
    progress_start: float = 0.0,
    progress_span: float = 100.0,
    status_key: Optional[str] = None,
) -> None:
    """Runs ffmpeg with ``args`` and maps its output time onto the job's progress range."""
    if out_path is not None:
        inputs = [args[i + 1] for i in range(len(args) - 1) if args[i] == "-i"]
        if any(same_file(src, out_path) for src in inputs):
            raise ValueError("common.outputIsInput")
    ffmpeg = resolve_binary("ffmpeg")
    cmd = [ffmpeg, "-y", "-hide_banner", "-v", "error", "-nostats", "-progress", "pipe:1", *args]

    def on_line(line: str) -> None:
        key, _, value = line.partition("=")
        if key != "out_time_us" or duration <= 0:
            return
        try:
            seconds = int(value) / 1_000_000
        except ValueError:
            return
        fraction = max(0.0, min(1.0, seconds / duration))
        ctx.progress(progress_start + progress_span * fraction, status_key)

    run_process(ctx, cmd, out_path=out_path, on_line=on_line)


def _parse_rate(rate: str) -> float:
    try:
        num, den = map(float, rate.split("/"))
        return round(num / den, 2) if den else 0.0
    except (ValueError, ZeroDivisionError):
        return 0.0


def _stream_duration(stream: Dict[str, Any]) -> float:
    """A stream's own length: ``duration`` (MP4) or the ``DURATION`` tag (Matroska); 0 when unknown."""
    if stream.get("duration"):
        return float(stream["duration"])
    tag = (stream.get("tags") or {}).get("DURATION", "")
    try:
        hours, minutes, seconds = tag.split(":")
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except ValueError:
        return 0.0


def probe_media(file_path: str) -> Dict[str, Any]:
    """Inspects a video or audio file with ffprobe and extracts stream metadata and a thumbnail."""
    p = Path(file_path)
    if not p.is_file():
        raise MissingFile(file_path)

    ffprobe = resolve_binary("ffprobe")
    ffmpeg = resolve_binary("ffmpeg")

    try:
        proc = run_capture(
            [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(p)],
            timeout=15,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="replace"))
        data = json.loads(proc.stdout.decode("utf-8", errors="replace"))
    except Exception as e:
        logger.error("ffprobe failed on %s: %s", file_path, e)
        raise AppError("errors.mediaUnreadable", file=p.name) from e

    format_info = data.get("format", {})
    streams = data.get("streams", [])

    duration = float(format_info.get("duration") or 0.0)
    size_bytes = int(format_info.get("size") or p.stat().st_size)
    format_name = format_info.get("format_name", p.suffix.lstrip("."))

    video_stream: Optional[Dict[str, Any]] = None
    audio_tracks: List[Dict[str, Any]] = []
    subtitles: List[Dict[str, Any]] = []

    for s in streams:
        c_type = s.get("codec_type")
        if c_type == "video" and video_stream is None:
            fps = _parse_rate(s.get("avg_frame_rate", "")) or _parse_rate(s.get("r_frame_rate", "")) or 30.0

            s_dur = float(s.get("duration") or duration)
            if s_dur > duration:
                duration = s_dur

            video_stream = {
                "index": int(s.get("index", 0)),
                "codec": s.get("codec_name", "unknown"),
                "width": int(s.get("width") or 0),
                "height": int(s.get("height") or 0),
                "fps": fps,
                "bitrate": int(s.get("bit_rate") or 0),
                "duration": _stream_duration(s),
            }
        elif c_type == "audio":
            tags = s.get("tags") or {}
            title = tags.get("title") or tags.get("handler_name") or f"Audio Track {len(audio_tracks) + 1}"
            lang = tags.get("language") or "und"
            audio_tracks.append({
                "index": int(s.get("index", len(audio_tracks))),
                "streamIndex": int(s.get("index", len(audio_tracks))),
                "codec": s.get("codec_name", "aac"),
                "channels": int(s.get("channels") or 2),
                "sampleRate": int(s.get("sample_rate") or 44100),
                "bitrate": int(s.get("bit_rate") or 0),
                "title": title,
                "language": lang,
            })
        elif c_type == "subtitle":
            subtitles.append({"index": int(s.get("index", 0)), "codec": s.get("codec_name", "")})

    thumbnail = ""
    if video_stream and video_stream.get("width", 0) > 0 and duration > 0:
        thumb_time = min(1.0, max(0.0, duration * 0.1))
        try:
            thumbnail = grab_frame(ffmpeg, p, thumb_time, width=360)
        except Exception as e:
            logger.debug("Thumbnail generation skipped: %s", e)

    return {
        "path": str(p),
        "fileName": p.name,
        "size": size_bytes,
        "format": format_name,
        "duration": round(duration, 3),
        "hasVideo": video_stream is not None,
        "hasAudio": len(audio_tracks) > 0,
        "width": video_stream["width"] if video_stream else 0,
        "height": video_stream["height"] if video_stream else 0,
        "fps": video_stream["fps"] if video_stream else 0.0,
        "videoCodec": video_stream["codec"] if video_stream else "",
        "audioTracks": audio_tracks,
        "subtitles": subtitles,
        "videoDuration": round((video_stream["duration"] or duration) if video_stream else 0.0, 3),
        "thumbnail": thumbnail,
    }


def grab_frame(ffmpeg: str, path: Path, time_sec: float, height: int = 0, width: int = 0) -> str:
    """One JPEG frame at ``time_sec`` scaled to ``height`` (or ``width``), as a data URL."""
    scale = f"scale=-2:{height}" if height else f"scale={width or 360}:-2"
    cmd = [
        ffmpeg,
        "-v", "quiet",
        "-ss", f"{time_sec:.3f}",
        "-i", str(path),
        "-frames:v", "1",
        "-vf", scale,
        "-f", "image2",
        "-c:v", "mjpeg",
        "-q:v", "5",
        "-",
    ]
    proc = run_capture(cmd, timeout=15)
    if not proc.stdout:
        return ""
    return f"data:image/jpeg;base64,{base64.b64encode(proc.stdout).decode('ascii')}"


def extract_frames(
    file_path: str,
    start_sec: float,
    duration: float,
    count: int,
    height: int = 96,
) -> Dict[str, Any]:
    """Evenly spaced JPEG frames over [start_sec, start_sec + duration] for a timeline's picture track.

    Each frame is grabbed with an input-side seek, which stays fast on long videos where decoding
    the whole window with an fps filter would not.
    """
    p = Path(file_path)
    if not p.is_file():
        raise MissingFile(file_path)

    ffmpeg = resolve_binary("ffmpeg")
    count = max(1, min(int(count), 200))
    duration = max(0.0, float(duration))
    step = duration / count
    times = [round(max(0.0, start_sec + (i + 0.5) * step), 3) for i in range(count)]

    with ThreadPoolExecutor(max_workers=min(4, os.cpu_count() or 1)) as pool:
        urls = list(pool.map(lambda t: grab_frame(ffmpeg, p, t, height=int(height)), times))

    return {"frames": [{"time": t, "dataUrl": url} for t, url in zip(times, urls) if url]}

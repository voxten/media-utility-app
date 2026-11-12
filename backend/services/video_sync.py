"""Audio-Video Synchronization service using FFmpeg and FFprobe.

Allows loading .mp4 and other video formats, inspecting audio streams, extracting
waveform amplitude peaks for interactive visualization, fast preview generation
(e.g. 10s-30s slice at any point of a long video), and exporting synchronized media.
"""

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from backend.core.errors import AppError, MissingFile
from backend.core.ffmpeg import NO_WINDOW, extract_frames, probe_media, resolve_binary, run_capture, run_ffmpeg
from backend.core import media_server
from backend.core.jobs import JobContext
from backend.core.paths import cache_dir

logger = logging.getLogger(__name__)

SUPPORTED_VIDEO_FORMATS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".wmv", ".ts", ".m4v", ".3gp", ".mpeg", ".mpg"
}
SUPPORTED_AUDIO_FORMATS = {
    ".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg", ".opus", ".wma", ".aiff"
}
TEXT_SUBTITLE_CODECS = {"subrip", "ass", "ssa", "mov_text", "webvtt", "text"}
MP4_CONTAINERS = {".mp4", ".m4v", ".mov"}


def _subtitle_args(subtitles: List[Dict[str, Any]], out_suffix: str) -> Tuple[List[str], int]:
    """FFmpeg arguments that keep the video's subtitles ``out_suffix`` can hold, and how many are left out.

    Matroska takes every track as is; MP4 takes text tracks only, converted to mov_text.
    """
    suffix = out_suffix.lower()
    if suffix == ".mkv":
        kept, codec = subtitles, "copy"
    elif suffix in MP4_CONTAINERS:
        kept, codec = [s for s in subtitles if s["codec"] in TEXT_SUBTITLE_CODECS], "mov_text"
    else:
        kept, codec = [], ""
    args = [arg for s in kept for arg in ("-map", f"0:{s['index']}")]
    if kept:
        args += ["-c:s", codec]
    return args, len(subtitles) - len(kept)


def _peaks(raw: bytes, target_points: int) -> Tuple[List[float], float]:
    """Normalized peak level per point, and the loudest sample.

    The points split all samples evenly (none dropped at the end), so point ``i`` of ``n`` covers
    the ``i``-th share of the audio and lines up with the timeline at any zoom.
    """
    samples = np.abs(np.frombuffer(raw, dtype="<f4", count=len(raw) // 4))
    count = min(target_points, samples.size)
    starts = np.arange(count) * samples.size // count
    peaks = np.maximum.reduceat(samples, starts)
    max_peak = float(peaks.max())
    if max_peak > 0.001:
        peaks = np.minimum(1.0, peaks / max_peak)
    return np.round(peaks, 3).tolist(), max_peak


def extract_waveform(
    file_path: str,
    stream_index: Optional[int] = None,
    points: int = 1200,
    start_sec: float = 0.0,
    duration: Optional[float] = None,
) -> Dict[str, Any]:
    """Extracts normalized audio amplitude peaks using FFmpeg.

    Returns a list of normalized peak levels in range [0.0, 1.0] and RMS levels.
    """
    p = Path(file_path)
    if not p.is_file():
        raise MissingFile(file_path)

    ffmpeg = resolve_binary("ffmpeg")
    target_points = max(50, min(5000, points))

    cmd = [ffmpeg, "-v", "quiet", "-y"]
    if start_sec > 0:
        cmd.extend(["-ss", f"{start_sec:.3f}"])
    if duration and duration > 0:
        cmd.extend(["-t", f"{duration:.3f}"])

    cmd.extend(["-i", str(p)])

    if stream_index is not None:
        cmd.extend(["-map", f"0:{stream_index}"])
    else:
        cmd.extend(["-map", "0:a:0"])

    # 1000 Hz sample rate is plenty for waveform visualizer and fast to decode
    cmd.extend(["-vn", "-ac", "1", "-ar", "1000", "-f", "f32le", "-"])

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            creationflags=NO_WINDOW,
        )
        try:
            raw_bytes, _ = proc.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise
    except Exception as e:
        logger.error("FFmpeg waveform extraction failed: %s", e)
        raise AppError("errors.audioUnreadable", file=p.name) from e

    sample_count = len(raw_bytes) // 4
    if sample_count == 0:
        return {"points": [0.0] * target_points, "duration": duration or 0.0, "sampleCount": 0}

    normalized_peaks, max_peak = _peaks(raw_bytes, target_points)

    return {
        "points": normalized_peaks,
        "sampleCount": sample_count,
        "duration": round(sample_count / 1000.0, 3),
        "startSec": round(start_sec, 3),
        "maxPeak": round(max_peak, 3),
    }


def generate_preview(
    video_path: str,
    offset_sec: float,
    start_sec: float = 0.0,
    duration: float = 30.0,
    audio_path: Optional[str] = None,
    audio_stream_idx: int = 0,
) -> Dict[str, Any]:
    """Generates a fast synchronized preview video slice (e.g. 10s-30s).

    Fast seeks both video and audio with appropriate delay/advance, scales to 480p
    using ultrafast preset, and returns a URL the window can play it from.
    """
    v_path = Path(video_path)
    if not v_path.is_file():
        raise MissingFile(video_path)

    a_path = Path(audio_path) if audio_path else v_path
    if not a_path.is_file():
        raise MissingFile(a_path)

    ffmpeg = resolve_binary("ffmpeg")
    preview_dur = max(2.0, min(120.0, float(duration)))
    preview_start = max(0.0, float(start_sec))
    offset = float(offset_sec)

    temp_out = cache_dir() / f"preview_sync_{os.getpid()}_{int(time.time() * 1000)}.mp4"

    # Audio timing logic:
    # At preview time t (0 <= t < preview_dur), video is at preview_start + t.
    # Audio needed is at (preview_start + t) - offset = (preview_start - offset) + t.
    audio_target = preview_start - offset

    cmd = [ffmpeg, "-y", "-v", "warning"]

    if audio_target >= 0:
        # Both video and audio can be fast-seeked directly!
        cmd.extend([
            "-ss", f"{preview_start:.3f}", "-t", f"{preview_dur:.3f}", "-i", str(v_path),
            "-ss", f"{audio_target:.3f}", "-t", f"{preview_dur:.3f}", "-i", str(a_path),
            "-map", "0:v:0",
            "-map", f"1:a:{audio_stream_idx}",
        ])
    else:
        # Audio was delayed and haven't started yet at preview_start; need silence padding
        silence_sec = abs(audio_target)
        silence_ms = int(silence_sec * 1000)
        audio_feed_dur = max(0.1, preview_dur - silence_sec)

        cmd.extend([
            "-ss", f"{preview_start:.3f}", "-t", f"{preview_dur:.3f}", "-i", str(v_path),
            "-ss", "0", "-t", f"{audio_feed_dur:.3f}", "-i", str(a_path),
            "-filter_complex", f"[1:a:{audio_stream_idx}]adelay={silence_ms}|{silence_ms}:all=1[aout]",
            "-map", "0:v:0",
            "-map", "[aout]",
        ])

    # Fast 480p encoding for preview
    cmd.extend([
        "-vf", "scale=-2:480",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(temp_out),
    ])

    t0 = time.time()
    try:
        proc = run_capture(cmd, timeout=30)
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace")
            logger.error("FFmpeg preview generation failed: %s", err)
            raise AppError("errors.previewFailed")

        size_bytes = temp_out.stat().st_size
        preview_url = media_server.slot_url("video_sync.preview", temp_out)
    except BaseException:
        temp_out.unlink(missing_ok=True)
        raise

    logger.info("Generated %s preview in %.2fs (%d bytes)", preview_dur, time.time() - t0, size_bytes)
    return {
        "previewUrl": preview_url,
        "duration": preview_dur,
        "offsetSec": offset,
        "startSec": preview_start,
        "sizeBytes": size_bytes,
    }


def sync_video(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """Background job that exports the full synchronized video with applied audio offset."""
    video_path = params["videoPath"]
    v_p = Path(video_path)
    if not v_p.is_file():
        raise MissingFile(video_path)

    audio_path = params.get("audioPath")
    a_p = Path(audio_path) if audio_path else v_p
    if not a_p.is_file():
        raise MissingFile(a_p)

    out_path = Path(params["outputPath"])
    out_path.parent.mkdir(parents=True, exist_ok=True)

    offset_sec = float(params.get("offsetSec", 0.0))
    audio_track_idx = int(params.get("audioTrackIndex", 0))
    mode = params.get("mode", "fast_copy")  # "fast_copy" or "reencode"

    ctx.progress(5, "video_sync.status.preparing")
    ctx.log("video_sync.log.starting", path=v_p.name, offset=f"{offset_sec:+.3f}s")
    info = probe_media(str(v_p))
    duration = info["videoDuration"] or info["duration"]

    # Input 0: video
    cmd = ["-i", str(v_p)]

    # Input 1: audio (either separate audio file or same video file)
    cmd.extend(["-i", str(a_p)])

    # Audio offset filter
    # If offset >= 0: delay audio by offset_sec
    # If offset < 0: trim beginning of audio by abs(offset_sec)
    if offset_sec >= 0:
        delay_ms = int(round(offset_sec * 1000))
        filter_str = f"[1:a:{audio_track_idx}]adelay={delay_ms}|{delay_ms}:all=1[aout]"
    else:
        trim_start = abs(offset_sec)
        filter_str = f"[1:a:{audio_track_idx}]atrim=start={trim_start:.4f},asetpts=PTS-STARTPTS[aout]"

    cmd.extend(["-filter_complex", filter_str])
    cmd.extend(["-map", "0:v:0", "-map", "[aout]"])
    subtitle_args, skipped = _subtitle_args(info.get("subtitles", []), out_path.suffix)
    cmd.extend(subtitle_args)
    if skipped:
        ctx.log("video_sync.log.subtitlesSkipped", "warning", count=skipped, format=out_path.suffix.lstrip(".").upper())
    cmd.extend(["-map_chapters", "0"])
    # A delayed track runs past the picture; the export keeps the video's length. (-shortest would
    # also stop at the end of the last subtitle.)
    if duration > 0:
        cmd.extend(["-t", f"{duration:.3f}"])

    if mode == "fast_copy":
        # Video stream copy (lossless, instant!), re-encode audio to AAC
        cmd.extend([
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
        ])
    else:
        # Full high-quality reencode
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "256k",
        ])

    cmd.extend(["-movflags", "+faststart", str(out_path)])

    ctx.progress(20, "video_sync.status.syncing")
    ctx.check_cancelled()

    run_ffmpeg(ctx, cmd, duration, out_path=out_path, progress_start=20, progress_span=78,
               status_key="video_sync.status.syncing")

    if not out_path.is_file():
        raise AppError("errors.outputMissing")

    final_size = out_path.stat().st_size
    ctx.progress(100, "video_sync.status.done")
    ctx.log("video_sync.log.finished", out=out_path.name, size=final_size)

    return {
        "outputPath": str(out_path),
        "fileName": out_path.name,
        "bytes": final_size,
        "offsetSec": offset_sec,
    }

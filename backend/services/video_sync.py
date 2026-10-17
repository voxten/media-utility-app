"""Audio-Video Synchronization service using FFmpeg and FFprobe.

Allows loading .mp4 and other video formats, inspecting audio streams, extracting
waveform amplitude peaks for interactive visualization, fast preview generation
(e.g. 10s-30s slice at any point of a long video), and exporting synchronized media.
"""

import base64
import json
import logging
import os
import shutil
import struct
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.core import deps
from backend.core.jobs import JobContext

logger = logging.getLogger(__name__)

SUPPORTED_VIDEO_FORMATS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".wmv", ".ts", ".m4v", ".3gp", ".mpeg", ".mpg"
}
SUPPORTED_AUDIO_FORMATS = {
    ".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg", ".opus", ".wma", ".aiff"
}


def _resolve_binary(name: str) -> str:
    """Finds binary on PATH after ensuring custom and app data paths are registered."""
    deps.ensure_app_paths()
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"Required binary '{name}' was not found. Please install FFmpeg.")
    return path


def probe_media(file_path: str) -> Dict[str, Any]:
    """Inspects video or audio file using ffprobe and extracts stream metadata and a thumbnail."""
    p = Path(file_path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {file_path}")

    ffprobe = _resolve_binary("ffprobe")
    ffmpeg = _resolve_binary("ffmpeg")

    cmd = [
        ffprobe,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(p),
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=15,
        )
        data = json.loads(proc.stdout.decode("utf-8", errors="replace"))
    except Exception as e:
        logger.error("ffprobe failed on %s: %s", file_path, e)
        raise RuntimeError(f"Could not inspect media file: {e}") from e

    format_info = data.get("format", {})
    streams = data.get("streams", [])

    duration = float(format_info.get("duration") or 0.0)
    size_bytes = int(format_info.get("size") or p.stat().st_size)
    format_name = format_info.get("format_name", p.suffix.lstrip("."))

    video_stream: Optional[Dict[str, Any]] = None
    audio_tracks: List[Dict[str, Any]] = []

    for s in streams:
        c_type = s.get("codec_type")
        if c_type == "video" and video_stream is None:
            # First video stream
            r_fps = s.get("r_frame_rate", "30/1")
            try:
                num, den = map(float, r_fps.split("/"))
                fps = round(num / den, 2) if den else 30.0
            except Exception:
                fps = 30.0

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

    # Generate a lightweight thumbnail frame for video if video stream exists
    thumbnail = ""
    if video_stream and video_stream.get("width", 0) > 0 and duration > 0:
        thumb_time = min(1.0, max(0.0, duration * 0.1))
        thumb_cmd = [
            ffmpeg,
            "-v", "quiet",
            "-ss", str(thumb_time),
            "-i", str(p),
            "-vframes", "1",
            "-vf", "scale=360:-1",
            "-f", "image2",
            "-c:v", "mjpeg",
            "-",
        ]
        try:
            thumb_proc = subprocess.run(
                thumb_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            if thumb_proc.stdout:
                thumbnail = f"data:image/jpeg;base64,{base64.b64encode(thumb_proc.stdout).decode('ascii')}"
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
        "thumbnail": thumbnail,
    }


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
        raise FileNotFoundError(f"File not found: {file_path}")

    ffmpeg = _resolve_binary("ffmpeg")
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
        )
        raw_bytes, _ = proc.communicate(timeout=60)
    except Exception as e:
        logger.error("FFmpeg waveform extraction failed: %s", e)
        raise RuntimeError(f"Could not extract audio waveform: {e}") from e

    sample_count = len(raw_bytes) // 4
    if sample_count == 0:
        return {"points": [0.0] * target_points, "duration": duration or 0.0, "sampleCount": 0}

    # Unpack float32 samples in range [-1.0, 1.0]
    samples = [s[0] for s in struct.iter_unpack("<f", raw_bytes)]

    # Compute bucketed peak amplitudes
    bucket_size = max(1, sample_count // target_points)
    peaks: List[float] = []
    max_peak = 0.0

    for i in range(0, sample_count, bucket_size):
        chunk = samples[i:i + bucket_size]
        if not chunk:
            continue
        p_val = max(abs(x) for x in chunk)
        if p_val > max_peak:
            max_peak = p_val
        peaks.append(p_val)
        if len(peaks) >= target_points:
            break

    # Normalize to 0.0 .. 1.0
    norm_factor = 1.0 / max_peak if max_peak > 0.001 else 1.0
    normalized_peaks = [round(min(1.0, p * norm_factor), 3) for p in peaks]

    # Ensure exact length
    while len(normalized_peaks) < target_points:
        normalized_peaks.append(0.0)

    return {
        "points": normalized_peaks,
        "sampleCount": sample_count,
        "duration": round(sample_count / 1000.0, 3),
        "startSec": round(start_sec, 3),
        "maxPeak": round(max_peak, 3),
    }


def _grab_frame(ffmpeg: str, path: Path, time_sec: float, height: int) -> str:
    cmd = [
        ffmpeg,
        "-v", "quiet",
        "-ss", f"{time_sec:.3f}",
        "-i", str(path),
        "-frames:v", "1",
        "-vf", f"scale=-2:{height}",
        "-f", "image2",
        "-c:v", "mjpeg",
        "-q:v", "5",
        "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
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
    """Evenly spaced JPEG frames over [start_sec, start_sec + duration] for the timeline's picture track.

    Each frame is grabbed with an input-side seek, which stays fast on long videos where decoding
    the whole window with an fps filter would not.
    """
    p = Path(file_path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {file_path}")

    ffmpeg = _resolve_binary("ffmpeg")
    count = max(1, min(int(count), 200))
    duration = max(0.0, float(duration))
    step = duration / count
    times = [round(max(0.0, start_sec + (i + 0.5) * step), 3) for i in range(count)]

    with ThreadPoolExecutor(max_workers=min(4, os.cpu_count() or 1)) as pool:
        urls = list(pool.map(lambda t: _grab_frame(ffmpeg, p, t, int(height)), times))

    return {"frames": [{"time": t, "dataUrl": url} for t, url in zip(times, urls) if url]}


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
    using ultrafast preset, and returns the result as a base64 data URL.
    """
    v_path = Path(video_path)
    if not v_path.is_file():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    a_path = Path(audio_path) if audio_path else v_path
    if not a_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {a_path}")

    ffmpeg = _resolve_binary("ffmpeg")
    preview_dur = max(2.0, min(120.0, float(duration)))
    preview_start = max(0.0, float(start_sec))
    offset = float(offset_sec)

    temp_out = Path(tempfile.gettempdir()) / f"preview_sync_{os.getpid()}_{int(time.time() * 1000)}.mp4"

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
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace")
            logger.error("FFmpeg preview generation failed: %s", err)
            raise RuntimeError(f"Preview generation failed: {err}")

        file_bytes = temp_out.read_bytes()
        data_url = f"data:video/mp4;base64,{base64.b64encode(file_bytes).decode('ascii')}"
        size_bytes = len(file_bytes)
    finally:
        if temp_out.is_file():
            try:
                temp_out.unlink()
            except OSError:
                pass

    logger.info("Generated %s preview in %.2fs (%d bytes)", preview_dur, time.time() - t0, size_bytes)
    return {
        "previewUrl": data_url,
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
        raise FileNotFoundError(f"Video file not found: {video_path}")

    audio_path = params.get("audioPath")
    a_p = Path(audio_path) if audio_path else v_p
    if not a_p.is_file():
        raise FileNotFoundError(f"Audio file not found: {a_p}")

    out_path = Path(params["outputPath"])
    out_path.parent.mkdir(parents=True, exist_ok=True)

    offset_sec = float(params.get("offsetSec", 0.0))
    audio_track_idx = int(params.get("audioTrackIndex", 0))
    mode = params.get("mode", "fast_copy")  # "fast_copy" or "reencode"

    ffmpeg = _resolve_binary("ffmpeg")

    ctx.progress(5, "video_sync.status.preparing")
    ctx.log("video_sync.log.starting", path=v_p.name, offset=f"{offset_sec:+.3f}s")

    cmd = [ffmpeg, "-y", "-v", "warning"]

    # Input 0: video
    cmd.extend(["-i", str(v_p)])

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

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Monitor process
    while proc.poll() is None:
        if ctx.cancelled:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
            if out_path.is_file():
                try:
                    out_path.unlink()
                except OSError:
                    pass
            ctx.check_cancelled()
        time.sleep(0.3)
        ctx.progress(60, "video_sync.status.syncing")

    stderr_bytes = proc.stderr.read() if proc.stderr else b""
    if proc.returncode != 0:
        err = stderr_bytes.decode("utf-8", errors="replace")
        logger.error("FFmpeg full sync failed: %s", err)
        raise RuntimeError(f"FFmpeg sync export failed: {err}")

    if not out_path.is_file():
        raise RuntimeError("Output file was not generated")

    final_size = out_path.stat().st_size
    ctx.progress(100, "video_sync.status.done")
    ctx.log("video_sync.log.finished", out=out_path.name, size=final_size)

    return {
        "outputPath": str(out_path),
        "fileName": out_path.name,
        "bytes": final_size,
        "offsetSec": offset_sec,
    }

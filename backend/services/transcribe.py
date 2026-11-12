"""Speech to text with faster-whisper: TXT transcripts and SRT / VTT subtitles from video or audio.

Audio is decoded by the app's FFmpeg (mono, 16 kHz float), not by PyAV, so every format FFmpeg
reads works. Subtitle cues are built from word timestamps: Whisper's own segments last up to
30 s, far too long to read on screen.
"""

import gc
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from backend.core.errors import AppError
from backend.core import whisper_models
from backend.core.ffmpeg import probe_media, run_ffmpeg
from backend.core.jobs import JobContext
from backend.core.paths import cache_dir, unique_path

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
FORMATS = ("srt", "vtt", "txt")
# Turbo was trained without the translate task and produces poor translations.
TRANSLATE_MODELS = ("base", "small")

MAX_LINE_CHARS = 42
MAX_CUE_LINES = 2
MAX_CUE_SECONDS = 6.0
MIN_CUE_SECONDS = 1.0
MAX_WORD_GAP = 1.0
SENTENCE_END = (".", "!", "?", "…")

DECODE_SPAN = 10.0
LOAD_SPAN = 5.0

_model_lock = threading.Lock()
_loaded: Dict[str, Any] = {}


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class Cue:
    start: float
    end: float
    text: str


def is_available() -> bool:
    return whisper_models.is_engine_installed()


def models() -> List[Dict[str, Any]]:
    """Every model with its download size (with the engine when it is missing) and whether it is ready."""
    engine = whisper_models.is_engine_installed()
    engine_size = 0 if engine else whisper_models.ENGINE_SIZE_MB * 1_000_000
    return [
        {
            "id": m.id,
            "depId": f"{whisper_models.DEP_PREFIX}{m.id}",
            "size": m.size + engine_size,
            "ready": engine and whisper_models.is_model_downloaded(m.id),
            "translate": m.id in TRANSLATE_MODELS,
        }
        for m in whisper_models.MODELS.values()
    ]


def probe(path: str) -> Dict[str, Any]:
    return probe_media(path)


def _cpu_threads() -> int:
    return max(1, min(8, (os.cpu_count() or 4) // 2))


def _create_model(model_id: str) -> Any:
    from faster_whisper import WhisperModel

    folder = whisper_models.model_dir(model_id)
    return WhisperModel(str(folder), device="cpu", compute_type="int8", cpu_threads=_cpu_threads())


def load_model(model_id: str) -> Any:
    """The model for ``model_id``, kept in memory; loading another one frees the previous one."""
    with _model_lock:
        model = _loaded.get(model_id)
        if model is None:
            _loaded.clear()
            gc.collect()
            model = _create_model(model_id)
            _loaded[model_id] = model
        return model


def verify_model(model_id: str) -> None:
    """Loads the model once to prove the engine's native libraries and the files work."""
    model = _create_model(model_id)
    del model
    gc.collect()


def _decode_audio(ctx: JobContext, path: str, duration: float, progress_start: float, progress_span: float) -> Any:
    import numpy as np

    raw = cache_dir() / f"whisper_{uuid.uuid4().hex[:10]}.f32"
    try:
        run_ffmpeg(
            ctx,
            ["-i", path, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", str(raw)],
            duration,
            out_path=raw,
            progress_start=progress_start,
            progress_span=progress_span,
            status_key="transcribe.status.decoding",
        )
        return np.fromfile(raw, dtype=np.float32)
    finally:
        raw.unlink(missing_ok=True)


# ---------------------------------------------------------------- cues and output formats


def _wrap(text: str, width: int = MAX_LINE_CHARS) -> List[str]:
    """Breaks ``text`` into lines of at most ``width`` characters, keeping the lines balanced."""
    if len(text) <= width:
        return [text]
    words = text.split()
    best: Optional[Tuple[int, int]] = None
    for i in range(1, len(words)):
        first, second = " ".join(words[:i]), " ".join(words[i:])
        longest = max(len(first), len(second))
        if best is None or longest < best[0]:
            best = (longest, i)
    if best is None:
        return [text]
    i = best[1]
    return [" ".join(words[:i]), " ".join(words[i:])]


def build_cues(words: Sequence[Word]) -> List[Cue]:
    """Groups words into subtitle cues short enough to read: at most two lines and six seconds."""
    cues: List[Cue] = []
    current: List[Word] = []
    max_chars = MAX_LINE_CHARS * MAX_CUE_LINES

    def flush() -> None:
        if current:
            text = " ".join(w.text for w in current)
            cues.append(Cue(current[0].start, current[-1].end, text))
            current.clear()

    for word in words:
        text = word.text.strip()
        if not text:
            continue
        word = Word(word.start, word.end, text)
        if current:
            joined = len(" ".join(w.text for w in current)) + 1 + len(text)
            too_long = joined > max_chars or word.end - current[0].start > MAX_CUE_SECONDS
            paused = word.start - current[-1].end > MAX_WORD_GAP
            if too_long or paused:
                flush()
        current.append(word)
        if text.endswith(SENTENCE_END) and current[-1].end - current[0].start >= MIN_CUE_SECONDS:
            flush()
    flush()

    # Short cues get time to be read; a short gap is closed so the text does not flicker.
    for index, cue in enumerate(cues):
        next_start = cues[index + 1].start if index + 1 < len(cues) else None
        if cue.end - cue.start < MIN_CUE_SECONDS:
            cue.end = cue.start + MIN_CUE_SECONDS
        if next_start is not None and (cue.end > next_start or 0 < next_start - cue.end < 0.5):
            cue.end = next_start
    return cues


def _timestamp(seconds: float, separator: str) -> str:
    ms = max(0, int(round(seconds * 1000)))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{separator}{ms:03d}"


def to_srt(cues: Iterable[Cue]) -> str:
    blocks = []
    for number, cue in enumerate(cues, 1):
        lines = "\n".join(_wrap(cue.text))
        blocks.append(f"{number}\n{_timestamp(cue.start, ',')} --> {_timestamp(cue.end, ',')}\n{lines}\n")
    return "\n".join(blocks)


def to_vtt(cues: Iterable[Cue]) -> str:
    blocks = ["WEBVTT\n"]
    for cue in cues:
        lines = "\n".join(_wrap(cue.text))
        blocks.append(f"{_timestamp(cue.start, '.')} --> {_timestamp(cue.end, '.')}\n{lines}\n")
    return "\n".join(blocks)


def to_txt(segments: Iterable[Cue]) -> str:
    return "\n".join(s.text.strip() for s in segments if s.text.strip()) + "\n"


def render(fmt: str, segments: Sequence[Cue], words: Sequence[Word]) -> str:
    if fmt == "txt":
        return to_txt(segments)
    cues = build_cues(words)
    return to_srt(cues) if fmt == "srt" else to_vtt(cues)


# ---------------------------------------------------------------- job


def transcribe_file(
    ctx: JobContext,
    path: str,
    model_id: str,
    language: Optional[str] = None,
    translate: bool = False,
    progress_start: float = 0.0,
    progress_span: float = 100.0,
) -> Dict[str, Any]:
    """Transcribes ``path``; returns the segments, words and detected language."""
    if not whisper_models.is_ready(model_id):
        raise AppError("errors.modelMissing")

    def at(fraction: float) -> float:
        return progress_start + progress_span * fraction / 100.0

    info = probe(path)
    if not info["hasAudio"]:
        raise AppError("errors.noAudio")
    duration = float(info["duration"] or 0.0)
    ctx.progress(at(0), "transcribe.status.decoding")

    audio = _decode_audio(ctx, path, duration, at(0), at(DECODE_SPAN) - at(0))
    duration = duration or len(audio) / SAMPLE_RATE
    ctx.check_cancelled()

    ctx.progress(at(DECODE_SPAN), "transcribe.status.loadingModel", {"model": model_id})
    model = load_model(model_id)
    ctx.check_cancelled()

    task = "translate" if translate and model_id in TRANSLATE_MODELS else "transcribe"
    start_pct = DECODE_SPAN + LOAD_SPAN
    ctx.progress(at(start_pct), "transcribe.status.transcribing", {"percent": 0})
    segments_iter, details = model.transcribe(
        audio,
        language=language or None,
        task=task,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
    )

    segments: List[Cue] = []
    words: List[Word] = []
    for segment in segments_iter:
        ctx.check_cancelled()
        segments.append(Cue(segment.start, segment.end, segment.text.strip()))
        if segment.words:
            words.extend(Word(w.start, w.end, w.word) for w in segment.words)
        else:
            words.append(Word(segment.start, segment.end, segment.text))
        done = min(100.0, segment.end * 100.0 / duration) if duration > 0 else 0.0
        ctx.progress(
            at(start_pct + (100.0 - start_pct) * done / 100.0),
            "transcribe.status.transcribing",
            {"percent": round(done)},
        )

    return {
        "segments": segments,
        "words": words,
        "language": details.language,
        "duration": duration,
    }


def write_output(fmt: str, out_path: str, segments: Sequence[Cue], words: Sequence[Word]) -> Path:
    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig: players and editors on Windows read BOM-less SRT files with Polish letters as ANSI.
    encoding = "utf-8-sig" if fmt == "srt" else "utf-8"
    target.write_text(render(fmt, segments, words), encoding=encoding)
    return target


def run(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """Job for the Transcription tool: one file in, one TXT / SRT / VTT file out."""
    t0 = time.monotonic()
    fmt = params.get("format", "srt")
    if fmt not in FORMATS:
        raise ValueError(f"Unsupported format: {fmt}")
    result = transcribe_file(
        ctx,
        params["path"],
        params.get("model", "small"),
        language=params.get("language") or None,
        translate=bool(params.get("translate")),
    )
    target = write_output(fmt, str(unique_path(Path(params["outPath"]))), result["segments"], result["words"])
    ctx.progress(100, "transcribe.status.done")
    return {
        "outPath": str(target),
        "format": fmt,
        "language": result["language"],
        "duration": round(result["duration"], 2),
        "elapsed": round(time.monotonic() - t0, 1),
        "segments": [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text} for s in result["segments"]],
    }


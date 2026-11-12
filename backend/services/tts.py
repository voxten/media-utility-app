"""Text-to-speech synthesis with edge-tts (online) or pyttsx3 (local SAPI voices)."""

import asyncio
import re
import shutil
import tempfile
import wave
from pathlib import Path
from typing import Any, Dict, List

from backend.core.errors import AppError
from backend.core.ffmpeg import run_ffmpeg
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import unique_path

ENGINES = ("edge", "pyttsx3")
FALLBACK_EDGE_VOICES = [
    {"id": "pl-PL-MarekNeural", "name": "Marek", "locale": "pl-PL", "gender": "Male"},
    {"id": "pl-PL-ZofiaNeural", "name": "Zofia", "locale": "pl-PL", "gender": "Female"},
    {"id": "en-US-GuyNeural", "name": "Guy", "locale": "en-US", "gender": "Male"},
    {"id": "en-GB-RyanNeural", "name": "Ryan", "locale": "en-GB", "gender": "Male"},
    {"id": "en-AU-WilliamNeural", "name": "William", "locale": "en-AU", "gender": "Male"},
]
DEFAULT_RATE = {"edge": 0, "pyttsx3": 200}
AUDIO_FORMATS = ("mp3", "wav", "ogg", "flac")
TEXT_FILE_LIMIT = 1024 * 1024
# pyttsx3 cannot stop in the middle of a file, so long text is spoken in parts of about this many
# characters; Cancel takes effect between them.
CHUNK_CHARS = 600
# Share of the progress bar for speaking; the rest is for encoding to MP3/OGG/FLAC.
SPEECH_SHARE = 80.0


def _com_init() -> None:
    """SAPI is COM-based; worker threads must initialise COM before using pyttsx3."""
    try:
        import pythoncom

        pythoncom.CoInitialize()
    except ImportError:
        pass


def list_edge_voices() -> List[Dict[str, Any]]:
    try:
        import edge_tts

        voices = asyncio.run(edge_tts.list_voices())
        return sorted(
            (
                {
                    "id": v["ShortName"],
                    "name": v["ShortName"].split("-")[-1].replace("Neural", "").replace("Multilingual", " Multilingual"),
                    "locale": v["Locale"],
                    "gender": v.get("Gender", ""),
                }
                for v in voices
            ),
            key=lambda v: (v["locale"], v["name"]),
        )
    except Exception:  # noqa: BLE001 - offline: fall back to a known list
        return list(FALLBACK_EDGE_VOICES)


def list_pyttsx3_voices() -> List[Dict[str, Any]]:
    _com_init()
    try:
        import pyttsx3

        engine = pyttsx3.init()
        voices = engine.getProperty("voices")
        return [
            {
                "id": v.id,
                "name": v.name,
                "locale": (v.languages[0] if getattr(v, "languages", None) else "") or "",
                "gender": getattr(v, "gender", "") or "",
            }
            for v in voices
        ]
    except Exception:  # noqa: BLE001
        return []


def read_text_file(path: str) -> str:
    """Text of a dropped .txt file: UTF-8 (with or without BOM), else Windows-1250 as Notepad saves Polish text."""
    src = Path(path)
    if src.suffix.lower() != ".txt" or not src.is_file():
        raise ValueError("tts.errors.notText")
    if src.stat().st_size > TEXT_FILE_LIMIT:
        raise ValueError("tts.errors.textTooLarge")
    data = src.read_bytes()
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1250", errors="replace")


def list_voices(engine: str) -> List[Dict[str, Any]]:
    if engine == "edge":
        return list_edge_voices()
    if engine == "pyttsx3":
        return list_pyttsx3_voices()
    raise ValueError(f"Unknown engine: {engine}")


def edge_rate(rate: Any) -> str:
    """Edge expects a signed percentage string, e.g. ``+10%`` / ``-20%``."""
    text = str(rate).strip().rstrip("%") or "0"
    value = int(float(text))
    return f"{value:+d}%"


def pyttsx3_rate(rate: Any) -> int:
    try:
        value = int(float(str(rate).strip()))
    except ValueError:
        return DEFAULT_RATE["pyttsx3"]
    return value if value > 0 else DEFAULT_RATE["pyttsx3"]


def split_text(text: str, size: int = CHUNK_CHARS) -> List[str]:
    """``text`` cut after sentence and line ends into parts of about ``size`` characters."""
    parts: List[str] = []
    current = ""
    for piece in re.split(r"(?<=[.!?…\n])\s+", text):
        if current and len(current) + len(piece) + 1 > size:
            parts.append(current)
            current = piece
        else:
            current = f"{current} {piece}" if current else piece
    if current:
        parts.append(current)
    return parts


def join_wavs(parts: List[Path], out_path: Path) -> None:
    with wave.open(str(out_path), "wb") as dst:
        for index, part in enumerate(parts):
            with wave.open(str(part), "rb") as src:
                if index == 0:
                    dst.setparams(src.getparams())
                dst.writeframes(src.readframes(src.getnframes()))


def _wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as src:
        return src.getnframes() / float(src.getframerate() or 1)


def _export(ctx: JobContext, speech: Path, out_path: Path, duration: float) -> None:
    """``speech`` saved as ``out_path``; another format goes through FFmpeg (no console window, cancellable)."""
    ctx.check_cancelled()
    if speech.suffix.lower() == out_path.suffix.lower():
        shutil.move(str(speech), str(out_path))
        return
    ctx.progress(SPEECH_SHARE, "tts.status.encoding")
    run_ffmpeg(
        ctx,
        ["-i", str(speech), str(out_path)],
        duration,
        out_path=out_path,
        progress_start=SPEECH_SHARE,
        progress_span=100 - SPEECH_SHARE,
        status_key="tts.status.encoding",
    )


async def _edge_bytes(ctx: JobContext, text: str, voice: str, rate: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate=rate)
    total_words = max(1, len(text.split()))
    spoken = 0
    audio = bytearray()
    async for chunk in communicate.stream():
        if ctx.cancelled:
            raise JobCancelled()
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"].endswith("Boundary"):
            spoken += len(str(chunk.get("text", "")).split())
            ctx.progress(min(1.0, spoken / total_words) * SPEECH_SHARE, "tts.status.synthesizing")
    return bytes(audio)


def _synth_edge(ctx: JobContext, text: str, voice: str, rate: Any, out_path: Path) -> None:
    ctx.progress(0, "tts.status.synthesizing")
    audio = asyncio.run(_edge_bytes(ctx, text, voice, edge_rate(rate)))
    if not audio:
        raise RuntimeError("edge-tts returned no audio")
    with tempfile.TemporaryDirectory() as tmp:
        speech = Path(tmp) / "speech.mp3"
        speech.write_bytes(audio)
        _export(ctx, speech, out_path, 0.0)


def _synth_pyttsx3(ctx: JobContext, text: str, voice: str, rate: Any, out_path: Path) -> None:
    import pyttsx3

    _com_init()
    engine = pyttsx3.init()
    if voice:
        engine.setProperty("voice", voice)
    engine.setProperty("rate", pyttsx3_rate(rate))

    parts = split_text(text)
    with tempfile.TemporaryDirectory() as tmp:
        files: List[Path] = []
        for number, part in enumerate(parts, 1):
            ctx.check_cancelled()
            ctx.progress((number - 1) / len(parts) * SPEECH_SHARE, "tts.status.synthesizing")
            wav = Path(tmp) / f"part{number}.wav"
            engine.save_to_file(part, str(wav))
            engine.runAndWait()
            if not wav.is_file() or wav.stat().st_size == 0:
                raise RuntimeError("pyttsx3 produced no audio")
            files.append(wav)
        ctx.check_cancelled()
        speech = Path(tmp) / "speech.wav"
        join_wavs(files, speech)
        _export(ctx, speech, out_path, _wav_seconds(speech))


def synthesize(ctx: JobContext, text: str, engine: str, voice: str, rate: Any, out_path: str) -> Dict[str, Any]:
    text = text.strip()
    if not text:
        raise AppError("errors.textEmpty")
    if engine not in ENGINES:
        raise ValueError(f"Unknown engine: {engine}")

    target = Path(out_path)
    if target.suffix.lower().lstrip(".") not in AUDIO_FORMATS:
        target = target.with_suffix(".mp3")
    target.parent.mkdir(parents=True, exist_ok=True)
    target = unique_path(target)

    if engine == "edge":
        _synth_edge(ctx, text, voice, rate, target)
    else:
        _synth_pyttsx3(ctx, text, voice, rate, target)

    ctx.progress(100, "tts.status.done")
    return {"outPath": str(target), "bytes": target.stat().st_size}

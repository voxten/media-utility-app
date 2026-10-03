"""Text-to-speech synthesis with edge-tts (online) or pyttsx3 (local SAPI voices)."""

import asyncio
import io
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from backend.core.jobs import JobContext

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


async def _edge_bytes(text: str, voice: str, rate: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate=rate)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)


def _synth_edge(ctx: JobContext, text: str, voice: str, rate: Any, out_path: Path) -> None:
    ctx.progress(None, "tts.status.synthesizing")
    audio = asyncio.run(_edge_bytes(text, voice, edge_rate(rate)))
    if not audio:
        raise RuntimeError("edge-tts returned no audio")
    ctx.check_cancelled()
    if out_path.suffix.lower() == ".mp3":
        out_path.write_bytes(audio)
    else:
        from pydub import AudioSegment

        ctx.progress(80, "tts.status.encoding")
        AudioSegment.from_file(io.BytesIO(audio), format="mp3").export(out_path, format=out_path.suffix.lstrip("."))


def _synth_pyttsx3(ctx: JobContext, text: str, voice: str, rate: Any, out_path: Path) -> None:
    import pyttsx3

    _com_init()
    ctx.progress(None, "tts.status.synthesizing")
    engine = pyttsx3.init()
    if voice:
        engine.setProperty("voice", voice)
    engine.setProperty("rate", pyttsx3_rate(rate))

    if out_path.suffix.lower() == ".wav":
        engine.save_to_file(text, str(out_path))
        engine.runAndWait()
        return

    with tempfile.TemporaryDirectory() as tmp:
        tmp_wav = Path(tmp) / "speech.wav"
        engine.save_to_file(text, str(tmp_wav))
        engine.runAndWait()
        if not tmp_wav.exists() or tmp_wav.stat().st_size == 0:
            raise RuntimeError("pyttsx3 produced no audio")
        ctx.check_cancelled()
        from pydub import AudioSegment

        ctx.progress(80, "tts.status.encoding")
        AudioSegment.from_wav(tmp_wav).export(out_path, format=out_path.suffix.lstrip("."))


def synthesize(ctx: JobContext, text: str, engine: str, voice: str, rate: Any, out_path: str) -> Dict[str, Any]:
    text = text.strip()
    if not text:
        raise ValueError("Text is empty")
    if engine not in ENGINES:
        raise ValueError(f"Unknown engine: {engine}")

    target = Path(out_path)
    if target.suffix.lower().lstrip(".") not in AUDIO_FORMATS:
        target = target.with_suffix(".mp3")
    target.parent.mkdir(parents=True, exist_ok=True)

    if engine == "edge":
        _synth_edge(ctx, text, voice, rate, target)
    else:
        _synth_pyttsx3(ctx, text, voice, rate, target)

    ctx.progress(100, "tts.status.done")
    return {"outPath": str(target), "bytes": target.stat().st_size}

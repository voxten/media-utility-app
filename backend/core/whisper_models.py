"""Whisper speech-to-text models (faster-whisper / CTranslate2) the app can download.

Each model is a Hugging Face repository pinned to a commit, so a renamed or updated repository
never changes what gets installed. Files are checked by their exact size.
"""

import importlib.util
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from backend.core.paths import app_data_dir

# faster-whisper 1.2.1 opens files with an argument PyAV 19 no longer has; the app decodes audio
# with its own FFmpeg instead, but the import of faster_whisper still needs av.
ENGINE_PACKAGES = ["faster-whisper==1.2.1"]
ENGINE_SIZE_MB = 200

HF_FILE_URL = "https://huggingface.co/{repo}/resolve/{revision}/{name}"


@dataclass(frozen=True)
class WhisperModel:
    id: str
    repo: str
    revision: str
    files: Dict[str, int]

    @property
    def size(self) -> int:
        return sum(self.files.values())


MODELS: Dict[str, WhisperModel] = {
    "base": WhisperModel(
        id="base",
        repo="Systran/faster-whisper-base",
        revision="ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66",
        files={
            "config.json": 2309,
            "tokenizer.json": 2203239,
            "vocabulary.txt": 459861,
            "model.bin": 145217532,
        },
    ),
    "small": WhisperModel(
        id="small",
        repo="Systran/faster-whisper-small",
        revision="536b0662742c02347bc0e980a01041f333bce120",
        files={
            "config.json": 2370,
            "tokenizer.json": 2203239,
            "vocabulary.txt": 459861,
            "model.bin": 483546902,
        },
    ),
    "turbo": WhisperModel(
        id="turbo",
        repo="dropbox-dash/faster-whisper-large-v3-turbo",
        revision="0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
        files={
            "config.json": 2263,
            "preprocessor_config.json": 340,
            "tokenizer.json": 2710337,
            "vocabulary.json": 1068114,
            "model.bin": 1617884929,
        },
    ),
}

DEP_PREFIX = "whisper_"


def get_model(model_id: str) -> WhisperModel:
    model = MODELS.get(model_id)
    if model is None:
        raise ValueError(f"Unknown Whisper model: {model_id}")
    return model


def model_for_dep(dep_id: str) -> Optional[WhisperModel]:
    """The model a ``whisper_<id>`` dependency installs, or None for other dependency ids."""
    if not dep_id.startswith(DEP_PREFIX):
        return None
    return MODELS.get(dep_id[len(DEP_PREFIX):])


def model_dir(model_id: str) -> Path:
    return app_data_dir() / "models" / "whisper" / model_id


def file_url(model: WhisperModel, name: str) -> str:
    return HF_FILE_URL.format(repo=model.repo, revision=model.revision, name=name)


def is_model_downloaded(model_id: str) -> bool:
    folder = model_dir(model_id)
    for name, size in get_model(model_id).files.items():
        path = folder / name
        if not path.is_file() or path.stat().st_size != size:
            return False
    return True


def is_engine_installed() -> bool:
    for name in ("faster_whisper", "ctranslate2"):
        try:
            if importlib.util.find_spec(name) is None:
                return False
        except (ImportError, ValueError):
            return False
    return True


def is_ready(model_id: str) -> bool:
    return is_engine_installed() and is_model_downloaded(model_id)


def size_label(size_bytes: int) -> str:
    mb = size_bytes / 1_000_000
    return f"~{mb / 1000:.1f} GB" if mb >= 1000 else f"~{round(mb)} MB"

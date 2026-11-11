"""Whisper speech-to-text models (faster-whisper / CTranslate2) the app can download.

Each model is a Hugging Face repository pinned to a commit, so a renamed or updated repository
never changes what gets installed. Downloads are checked by SHA-256, installed files by size.
"""

import importlib.util
from dataclasses import dataclass, field
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
    sha256: Dict[str, str] = field(default_factory=dict)

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
        sha256={
            "config.json": "56a6d8110d311f19c8f0471e562832c7527f146b567275bfca59fcf7c184da9a",
            "tokenizer.json": "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab",
            "vocabulary.txt": "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913",
            "model.bin": "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9",
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
        sha256={
            "config.json": "b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828",
            "tokenizer.json": "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab",
            "vocabulary.txt": "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913",
            "model.bin": "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671",
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
        sha256={
            "config.json": "b0253ea6c0d3bea6b1e19e91a02acfd3b53f4467362efcb5a3e6b16c9b3a9b7e",
            "preprocessor_config.json": "7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711",
            "tokenizer.json": "297b13372ac43916285644fb9687add3cc62ee2a1adb60da3dc25cc94c1871fd",
            "vocabulary.json": "c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1",
            "model.bin": "e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da",
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

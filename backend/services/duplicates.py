"""Perceptual duplicate detection for videos and images.

One scan/group/export pipeline with two hashing strategies (previously two ~90%
identical Qt tabs).
"""

import csv
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import imagehash
import numpy as np
from PIL import Image

from backend.core import thumbs
from backend.core.jobs import JobContext

VIDEO_EXTENSIONS = (".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".webm")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif", ".gif")
DURATION_TOLERANCE_MS = 1000
HASH_THRESHOLD = 12
SAMPLE_POINTS = [0.1, 0.3, 0.5, 0.7, 0.9]
THUMB_SIZE = (240, 160)

PHASH_SIZE = 8
PHASH_IMAGE = PHASH_SIZE * 4
# Unnormalised DCT-II basis, identical to scipy.fftpack.dct(type=2, norm=None):
# y[k] = 2 * sum_n x[n] * cos(pi * k * (2n + 1) / (2N)).
_n = np.arange(PHASH_IMAGE)
_DCT = 2 * np.cos(np.pi * _n[:, None] * (2 * _n[None, :] + 1) / (2 * PHASH_IMAGE))


def phash(image: Image.Image) -> imagehash.ImageHash:
    """Same result as imagehash.phash, without pulling SciPy (~70 MB) into the bundle."""
    small = image.convert("L").resize((PHASH_IMAGE, PHASH_IMAGE), Image.Resampling.LANCZOS)
    pixels = np.asarray(small, dtype=np.float64)
    dct = _DCT @ pixels @ _DCT.T  # DCT along axis 0, then axis 1
    low = dct[:PHASH_SIZE, :PHASH_SIZE]
    return imagehash.ImageHash(low > np.median(low))


@dataclass
class MediaItem:
    path: str
    size: int
    width: Optional[int]
    height: Optional[int]
    hashes: List[imagehash.ImageHash]
    duration: Optional[int] = None  # milliseconds, videos only
    thumb: Optional[str] = None  # data URL
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def filename(self) -> str:
        return Path(self.path).name

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "filename": self.filename,
            "size": self.size,
            "width": self.width,
            "height": self.height,
            "duration": self.duration,
            "thumb": self.thumb,
        }


def _read_image_unicode(path: Path) -> Optional[np.ndarray]:
    """cv2.imread fails on non-ASCII Windows paths; decode from bytes instead."""
    data = np.fromfile(str(path), dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


class ImageHasher:
    kind = "image"
    extensions = IMAGE_EXTENSIONS

    def analyze(self, path: Path) -> Optional[MediaItem]:
        try:
            frame = _read_image_unicode(path)
            if frame is None:
                return None
            height, width = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            return MediaItem(
                path=str(path),
                size=path.stat().st_size,
                width=width,
                height=height,
                hashes=[phash(pil_img)],
                thumb=thumbs.to_data_url(pil_img, THUMB_SIZE),
            )
        except Exception:  # noqa: BLE001 - corrupted files are reported by the caller
            return None


class VideoHasher:
    kind = "video"
    extensions = VIDEO_EXTENSIONS

    def metadata(self, path: Path) -> Optional[Dict[str, Any]]:
        try:
            from pymediainfo import MediaInfo

            media = MediaInfo.parse(str(path))
            for track in media.tracks:
                if track.track_type == "Video":
                    if not track.duration:
                        return None
                    return {
                        "duration": int(float(track.duration)),
                        "width": track.width,
                        "height": track.height,
                    }
        except Exception:  # noqa: BLE001
            return None
        return None

    def frames(self, path: Path) -> tuple:
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            return [], None
        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames <= 0:
                return [], None
            hashes: List[imagehash.ImageHash] = []
            middle = None
            for idx, point in enumerate(SAMPLE_POINTS):
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(total_frames * point))
                ok, frame = cap.read()
                if not ok:
                    continue
                img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                hashes.append(phash(img))
                if idx == len(SAMPLE_POINTS) // 2:
                    middle = img
            return hashes, middle
        finally:
            cap.release()

    def analyze(self, path: Path) -> Optional[MediaItem]:
        meta = self.metadata(path)
        if meta is None:
            return None
        hashes, middle = self.frames(path)
        if not hashes:
            return None
        return MediaItem(
            path=str(path),
            size=path.stat().st_size,
            width=meta["width"],
            height=meta["height"],
            duration=meta["duration"],
            hashes=hashes,
            thumb=thumbs.to_data_url(middle, THUMB_SIZE) if middle is not None else None,
        )


HASHERS = {"video": VideoHasher, "image": ImageHasher}


def average_hash_distance(h1: List[imagehash.ImageHash], h2: List[imagehash.ImageHash]) -> float:
    n = min(len(h1), len(h2))
    if n == 0:
        return float("inf")
    return sum(a - b for a, b in zip(h1, h2)) / n


def are_similar(a: MediaItem, b: MediaItem, threshold: float = HASH_THRESHOLD) -> bool:
    if a.duration is not None and b.duration is not None:
        if abs(a.duration - b.duration) > DURATION_TOLERANCE_MS:
            return False
    return average_hash_distance(a.hashes, b.hashes) <= threshold


def group_similar(items: List[MediaItem], threshold: float = HASH_THRESHOLD) -> List[List[MediaItem]]:
    """Connected components of the "similar" graph; only groups with 2+ items are returned."""
    n = len(items)
    adjacency: Dict[int, List[int]] = {i: [] for i in range(n)}
    for i in range(n):
        for j in range(i + 1, n):
            if are_similar(items[i], items[j], threshold):
                adjacency[i].append(j)
                adjacency[j].append(i)

    visited = set()
    groups = []
    for start in range(n):
        if start in visited:
            continue
        visited.add(start)
        component = []
        queue = deque([start])
        while queue:
            current = queue.popleft()
            component.append(items[current])
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        if len(component) > 1:
            groups.append(component)
    return groups


def collect_files(folder: str, extensions: tuple) -> List[Path]:
    return sorted(p for p in Path(folder).rglob("*") if p.is_file() and p.suffix.lower() in extensions)


def scan(ctx: JobContext, folder: str, mode: str, threshold: float = HASH_THRESHOLD) -> Dict[str, Any]:
    if mode not in HASHERS:
        raise ValueError(f"Unknown mode: {mode}")
    hasher = HASHERS[mode]()

    ctx.progress(None, "duplicates.status.collecting")
    files = collect_files(folder, hasher.extensions)
    if not files:
        ctx.progress(100, "duplicates.status.noFiles")
        return {"groups": [], "scanned": 0, "failed": 0, "mode": mode}

    items: List[MediaItem] = []
    failed = 0
    for idx, path in enumerate(files):
        ctx.check_cancelled()
        ctx.progress(idx / len(files) * 95, "duplicates.status.scanning", {"file": path.name})
        item = hasher.analyze(path)
        if item is None:
            failed += 1
            ctx.log("duplicates.log.corrupted", "error", file=str(path))
        else:
            items.append(item)

    ctx.progress(97, "duplicates.status.grouping")
    groups = group_similar(items, threshold)
    ctx.progress(100, "duplicates.status.done", {"groups": len(groups)})
    return {
        "groups": [[item.to_dict() for item in group] for group in groups],
        "scanned": len(items),
        "failed": failed,
        "mode": mode,
    }


def export_csv(groups: List[List[Dict[str, Any]]], out_path: str) -> str:
    """Write groups (as returned by :func:`scan`) to a CSV file."""
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Group", "Filename", "Resolution", "Duration (ms)", "Size (bytes)", "Full path"])
        for idx, group in enumerate(groups, start=1):
            for item in group:
                writer.writerow(
                    [
                        idx,
                        item["filename"],
                        f'{item.get("width")}x{item.get("height")}',
                        item.get("duration") if item.get("duration") is not None else "",
                        item["size"],
                        item["path"],
                    ]
                )
    return out_path

"""Perceptual duplicate detection for videos and images.

One scan/group/export pipeline with two hashing strategies (previously two ~90%
identical Qt tabs).
"""

import csv
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import imagehash
import numpy as np
from PIL import Image

from backend.core import system, thumbs
from backend.core.jobs import JobContext

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = (".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".webm")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif", ".gif")
DURATION_TOLERANCE_MS = 1000
HASH_THRESHOLD = 12
SAMPLE_POINTS = [0.1, 0.3, 0.5, 0.7, 0.9]
THUMB_SIZE = (240, 160)
# Share of the progress bar: reading files, then comparing them, then thumbnails of the found groups.
SCAN_SHARE, GROUP_SHARE = 90.0, 5.0

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
            )
        except Exception:  # noqa: BLE001 - corrupted files are reported by the caller
            return None

    def thumbnail(self, path: Path) -> Optional[str]:
        try:
            with Image.open(path) as img:
                img.draft("RGB", (THUMB_SIZE[0] * 2, THUMB_SIZE[1] * 2))
                return thumbs.to_data_url(img.convert("RGB"), THUMB_SIZE)
        except Exception:  # noqa: BLE001 - the group is still shown, without a picture
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

    def frames(self, path: Path) -> List[imagehash.ImageHash]:
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            return []
        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames <= 0:
                return []
            hashes: List[imagehash.ImageHash] = []
            for point in SAMPLE_POINTS:
                img = self._frame(cap, total_frames, point)
                if img is not None:
                    hashes.append(phash(img))
            return hashes
        finally:
            cap.release()

    @staticmethod
    def _frame(cap: Any, total_frames: int, point: float) -> Optional[Image.Image]:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total_frames * point))
        ok, frame = cap.read()
        return Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)) if ok else None

    def thumbnail(self, path: Path) -> Optional[str]:
        cap = cv2.VideoCapture(str(path))
        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if cap.isOpened() else 0
            middle = self._frame(cap, total_frames, 0.5) if total_frames > 0 else None
            return thumbs.to_data_url(middle, THUMB_SIZE) if middle is not None else None
        finally:
            cap.release()

    def analyze(self, path: Path) -> Optional[MediaItem]:
        meta = self.metadata(path)
        if meta is None:
            return None
        hashes = self.frames(path)
        if not hashes:
            return None
        return MediaItem(
            path=str(path),
            size=path.stat().st_size,
            width=meta["width"],
            height=meta["height"],
            duration=meta["duration"],
            hashes=hashes,
        )


HASHERS = {"video": VideoHasher, "image": ImageHasher}


def _hash_bits(items: List[MediaItem]) -> Tuple[np.ndarray, np.ndarray]:
    """Each item's hashes as 64-bit numbers (one row per item) and how many each item has."""
    width = max(len(item.hashes) for item in items)
    bits = np.zeros((len(items), width), dtype=np.uint64)
    for row, item in enumerate(items):
        for col, h in enumerate(item.hashes):
            bits[row, col] = np.packbits(np.asarray(h.hash, dtype=bool).ravel()).view(">u8")[0]
    return bits, np.array([len(item.hashes) for item in items])


def group_similar(
    items: List[MediaItem],
    threshold: float = HASH_THRESHOLD,
    ctx: Optional[JobContext] = None,
    progress_start: float = 0.0,
    progress_span: float = 100.0,
) -> List[List[MediaItem]]:
    """Connected components of the "similar" graph; only groups with 2+ items are returned.

    Two files are similar when the average bit difference of their hashes (taken in order, as many as
    both have) is at most ``threshold`` and, for videos, their lengths differ by at most a second.
    Each file is compared with all later ones in one numpy step, so 10 000 photos take seconds.
    """
    n = len(items)
    if n < 2:
        return []
    bits, counts = _hash_bits(items)
    durations = np.array([-1 if item.duration is None else item.duration for item in items], dtype=np.int64)
    parent = list(range(n))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n - 1):
        if ctx is not None and i % 64 == 0:
            ctx.check_cancelled()
            ctx.progress(progress_start + i / n * progress_span, "duplicates.status.grouping")
        later = slice(i + 1, n)
        shared = np.minimum(counts[later], counts[i])
        differing = np.cumsum(np.bitwise_count(bits[later] ^ bits[i]), axis=1, dtype=np.int64)
        total = differing[np.arange(n - i - 1), np.maximum(shared, 1) - 1]
        similar = (shared > 0) & (total <= threshold * shared)
        if durations[i] >= 0:
            other = durations[later]
            similar &= (other < 0) | (np.abs(other - durations[i]) <= DURATION_TOLERANCE_MS)
        for offset in np.nonzero(similar)[0]:
            a, b = root(i), root(i + 1 + int(offset))
            if a != b:
                parent[b] = a

    components: Dict[int, List[MediaItem]] = {}
    for index, item in enumerate(items):
        components.setdefault(root(index), []).append(item)
    return [group for group in components.values() if len(group) > 1]


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
        ctx.progress(idx / len(files) * SCAN_SHARE, "duplicates.status.scanning", {"file": path.name})
        item = hasher.analyze(path)
        if item is None:
            failed += 1
            ctx.log("duplicates.log.corrupted", "error", file=str(path))
        else:
            items.append(item)

    ctx.progress(SCAN_SHARE, "duplicates.status.grouping")
    groups = group_similar(items, threshold, ctx, SCAN_SHARE, GROUP_SHARE)
    found = [item for group in groups for item in group]
    thumbs_start = SCAN_SHARE + GROUP_SHARE
    for idx, item in enumerate(found):
        ctx.check_cancelled()
        ctx.progress(thumbs_start + idx / len(found) * (100 - thumbs_start), "duplicates.status.thumbnails")
        item.thumb = hasher.thumbnail(Path(item.path))
    ctx.progress(100, "duplicates.status.done", {"groups": len(groups)})
    return {
        "groups": [[item.to_dict() for item in group] for group in groups],
        "scanned": len(items),
        "failed": failed,
        "mode": mode,
    }


def export_csv(groups: List[List[Dict[str, Any]]], out_path: str) -> str:
    """Write groups (as returned by :func:`scan`) to a CSV file; the BOM makes Excel read Polish letters right."""
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
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


def trash(ctx: JobContext, paths: List[str]) -> Dict[str, Any]:
    """Move files to the Recycle Bin one by one; a failed file is reported and the rest go on.

    Cancelling stops before the next file and still returns what was moved, so the results stay true.
    """
    removed: List[str] = []
    errors: List[Dict[str, str]] = []
    for idx, path in enumerate(paths):
        if ctx.cancelled:
            break
        ctx.progress(idx / len(paths) * 100, "duplicates.status.trashing", {"file": Path(path).name})
        try:
            system.move_to_trash(path)
            removed.append(path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Moving %s to the Recycle Bin failed: %s", path, exc)
            errors.append({"path": path, "error": "errors.pathMissing" if isinstance(exc, FileNotFoundError) else "errors.trashFailed"})
    ctx.progress(100, "duplicates.status.trashed", {"count": len(removed)})
    return {"removed": removed, "count": len(removed), "failed": len(errors), "errors": errors}

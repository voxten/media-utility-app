"""Finished jobs kept across restarts, stored as JSON in the per-user app data directory."""

import copy
import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from backend.core.paths import app_data_dir

logger = logging.getLogger(__name__)

MAX_ENTRIES = 100
MAX_OUTPUTS = 50
# Metadata probes and engine updates are not work the user wants to find again.
SKIPPED_KINDS = frozenset({"download.probe", "instagram.probe", "pdf.inspect", "download.engines"})
# Result fields the job card summarises (frontend/src/lib/jobSummary.ts), kept so earlier jobs show them too.
STAT_KEYS = (
    "size", "totalSize", "bytes", "inBytes", "outBytes", "inputBytes", "outputBytes", "savedPercent",
    "duration", "pageCount", "count", "charCount", "width", "height", "frames", "length", "ext",
    "language", "format", "offsetSec", "succeeded", "failed", "total", "processed", "converted", "scanned",
)
MAX_STAT_TEXT = 32
# Queue items (link, title, outcome) kept so the history shows what a queue downloaded.
MAX_ITEMS = 200
MAX_ITEM_TEXT = 300
# A larger thumbnail is left out so the history file stays small.
MAX_THUMB_CHARS = 12_000


def _strings(values: Iterable[Any]) -> List[str]:
    return [v for v in values if isinstance(v, str) and v]


def result_outputs(result: Any, temp_dir: Optional[Path] = None) -> List[str]:
    """Files a job wrote, read from the result shapes the services return.

    Falls back to the output folder when no single file is named. Paths inside ``temp_dir``
    (previews the user has not saved yet) are left out.
    """
    if not isinstance(result, dict):
        return []
    found = _strings([result.get("outPath"), result.get("outputPath"), result.get("path")])
    files = result.get("files")
    if isinstance(files, list):
        found += _strings(files)
    items = result.get("items")
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict) and item.get("status", "done") == "done":
                found += _strings([item.get("dest") or item.get("path")])
    if not found:
        found = _strings([result.get("outputDir"), result.get("outDir"), result.get("outdir")])

    temp = temp_dir.resolve() if temp_dir else None
    outputs: List[str] = []
    for path in found:
        if path in outputs:
            continue
        if temp is not None:
            try:
                if Path(path).resolve().is_relative_to(temp):
                    continue
            except (OSError, ValueError):
                continue
        outputs.append(path)
    return outputs[:MAX_OUTPUTS]


def result_stats(result: Any) -> Dict[str, Any]:
    """The numbers and short texts of a result the job card summarises."""
    if not isinstance(result, dict):
        return {}
    stats: Dict[str, Any] = {}
    for key in STAT_KEYS:
        value = result.get(key)
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, (int, float)) or (isinstance(value, str) and 0 < len(value) <= MAX_STAT_TEXT):
            stats[key] = value
    groups = result.get("groups")
    if isinstance(groups, list):
        stats["groups"] = len(groups)
    items = result.get("items")
    if isinstance(items, list) and "total" not in stats:
        stats["total"] = len(items)
    files = result.get("files")
    if isinstance(files, list):
        stats["fileCount"] = len(files)
    return stats


def result_items(result: Any) -> List[Dict[str, Any]]:
    """The queue items of a result with only what the job card lists: link, title, outcome, size, error."""
    items = result.get("items") if isinstance(result, dict) else None
    if not isinstance(items, list):
        return []
    kept: List[Dict[str, Any]] = []
    for item in items[:MAX_ITEMS]:
        if not isinstance(item, dict) or not isinstance(item.get("index"), int):
            continue
        entry: Dict[str, Any] = {"index": item["index"]}
        for key in ("url", "title", "status", "error"):
            value = item.get(key)
            if isinstance(value, str) and value:
                entry[key] = value[:MAX_ITEM_TEXT]
        for key in ("size", "duration"):
            value = item.get(key)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                entry[key] = value
        kept.append(entry)
    return kept


def _small_meta(meta: Any, has_items: bool = False) -> Dict[str, Any]:
    if not isinstance(meta, dict):
        return {}
    kept = dict(meta)
    thumb = kept.get("thumb")
    if not isinstance(thumb, str) or len(thumb) > MAX_THUMB_CHARS:
        kept.pop("thumb", None)
    urls = kept.get("urls")
    if has_items or not isinstance(urls, list):
        kept.pop("urls", None)
    else:
        kept["urls"] = _strings(urls)[:MAX_ITEMS]
    return kept


def _with_availability(entry: Dict[str, Any]) -> Dict[str, Any]:
    outputs = entry.get("outputs") or []
    entry["available"] = bool(outputs) and Path(outputs[0]).exists()
    entry["singleFile"] = len(outputs) == 1 and Path(outputs[0]).is_file()
    return entry


class JobHistory:
    def __init__(self, path: Optional[Path] = None, temp_dir: Optional[Path] = None) -> None:
        self.path = path or app_data_dir() / "job_history.json"
        self._temp_dir = temp_dir
        self._lock = threading.Lock()
        self._entries = self._load()

    def _load(self) -> List[Dict[str, Any]]:
        try:
            stored = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        if not isinstance(stored, list):
            return []
        return [e for e in stored if isinstance(e, dict) and isinstance(e.get("id"), str)][:MAX_ENTRIES]

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._entries, indent=1, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.path)

    def record(
        self, job: Dict[str, Any], result: Any = None, replay: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Store a finished job (``JobInfo.to_dict()``) and return the entry, or None when skipped.

        ``replay`` is the bridge call that started the job (``jobs.replay_record``), kept so it can run again.
        """
        if job.get("kind") in SKIPPED_KINDS:
            return None
        items = result_items(result)
        entry = {
            "id": job["id"],
            "kind": job.get("kind") or "",
            "title": job.get("title") or "",
            "status": job.get("status") or "done",
            "startedAt": job.get("startedAt"),
            "finishedAt": job.get("finishedAt"),
            "error": job.get("error"),
            "outputs": result_outputs(result, self._temp_dir),
            "stats": result_stats(result),
            "meta": _small_meta(job.get("meta"), has_items=bool(items)),
        }
        if items:
            entry["items"] = items
        if replay:
            entry["replay"] = replay
        with self._lock:
            self._entries = [entry, *(e for e in self._entries if e.get("id") != entry["id"])][:MAX_ENTRIES]
            try:
                self._save()
            except OSError:
                logger.exception("could not save job history")
        return _with_availability(copy.deepcopy(entry))

    def entries(self) -> List[Dict[str, Any]]:
        """Newest first, each with ``available`` (its first output still exists) and ``singleFile`` (its one output is a file)."""
        with self._lock:
            entries = copy.deepcopy(self._entries)
        return [_with_availability(entry) for entry in entries]

    def get(self, entry_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            entry = next((e for e in self._entries if e.get("id") == entry_id), None)
            return copy.deepcopy(entry) if entry else None

    def remove(self, entry_id: str) -> bool:
        """Forget one finished job; False when it is not in the history."""
        with self._lock:
            kept = [e for e in self._entries if e.get("id") != entry_id]
            if len(kept) == len(self._entries):
                return False
            self._entries = kept
            try:
                self._save()
            except OSError:
                logger.exception("could not save job history")
        return True

    def clear(self) -> None:
        with self._lock:
            self._entries = []
            try:
                self._save()
            except OSError:
                logger.exception("could not clear job history")

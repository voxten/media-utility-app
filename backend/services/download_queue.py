"""Batch downloads: the running queue, links added to it and the unfinished queue saved for resuming."""

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import app_data_dir
from backend.services.download import (
    AUDIO_CODECS,
    DEFAULT_TEMPLATE,
    SUBTITLE_SHARE,
    _base_opts,
    _download_opts,
    _extract_listing,
    _ProgressHook,
    _run_ydl,
    _wants_subtitles,
    add_subtitles,
    batch_format,
    clean_error_message,
    output_template,
    sanitize_x_url,
)

QUEUE_VERSION = 2


def expand_batch_urls(
    urls: List[str],
    cookies: Optional[Dict[str, Optional[str]]] = None,
    ctx: Optional[JobContext] = None,
    report: bool = False,
) -> List[Dict[str, Any]]:
    """Expand playlist/folder URLs into individual video items with flat extraction.

    Checking each link takes a request, so ``ctx`` stops the loop when the job is cancelled and,
    with ``report``, shows how many links are checked.
    """
    items: List[Dict[str, Any]] = []
    seen_urls: set = set()

    for number, raw_url in enumerate(urls, 1):
        if ctx:
            ctx.check_cancelled()
            if report and len(urls) > 1:
                ctx.progress(None, "download.status.probingLinks", {"current": number, "total": len(urls)})
        url = sanitize_x_url(raw_url)
        if not url:
            continue
        try:
            opts = _base_opts(url, cookies or {})
            opts["extract_flat"] = True
            info = _extract_listing(url, opts)

            if info and (info.get("_type") == "playlist" or info.get("entries")):
                entries = list(info.get("entries") or [])
                playlist_title = info.get("title") or ""
                for idx, e in enumerate(entries):
                    e_url = e.get("url") or e.get("webpage_url") or ""
                    if not e_url and e.get("id"):
                        if "cda.pl" in url.lower():
                            e_url = f"https://www.cda.pl/video/{e.get('id')}"
                        elif "youtube.com" in url.lower() or "youtu.be" in url.lower():
                            e_url = f"https://www.youtube.com/watch?v={e.get('id')}"
                        else:
                            e_url = str(e.get("id"))
                    if e_url and e_url not in seen_urls:
                        seen_urls.add(e_url)
                        title = e.get("title")
                        if not title:
                            title = f"{playlist_title} [{idx + 1}]" if playlist_title else e_url
                        items.append({"url": e_url, "title": title})
            else:
                if url not in seen_urls:
                    seen_urls.add(url)
                    title = (info.get("title") if info else None) or url
                    items.append({"url": url, "title": title})
        except Exception:
            if url not in seen_urls:
                seen_urls.add(url)
                items.append({"url": url, "title": url})

    return items


def queue_path() -> Path:
    """Links of queues that did not finish, so the next start can resume them."""
    return app_data_dir() / "download_queue.json"


# Every batch writes its own entry (keyed by job id), so two queues at once never overwrite each other.
_file_lock = threading.Lock()


def _valid_entry(entry: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None
    urls = [u for u in entry.get("urls") or [] if isinstance(u, str) and u.strip()]
    options = entry.get("options")
    if not urls or not isinstance(options, dict) or not isinstance(options.get("outdir"), str):
        return None
    saved = entry.get("saved")
    return {"urls": urls, "options": options, "saved": saved if isinstance(saved, (int, float)) else 0}


def _read_queues(path: Path) -> Dict[str, Dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    if data.get("version") == 1:
        entry = _valid_entry(data)
        return {"previous": entry} if entry else {}
    if data.get("version") != QUEUE_VERSION or not isinstance(data.get("queues"), dict):
        return {}
    queues = {}
    for key, raw in data["queues"].items():
        entry = _valid_entry(raw)
        if isinstance(key, str) and entry:
            queues[key] = entry
    return queues


def _write_queues(path: Path, queues: Dict[str, Dict[str, Any]]) -> None:
    if not queues:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"version": QUEUE_VERSION, "queues": queues}, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def save_queue(key: str, urls: List[str], options: Dict[str, Any], path: Optional[Path] = None) -> None:
    """Write the unfinished links of one queue; no links removes its entry (and the file when it was the last)."""
    target = path or queue_path()
    with _file_lock:
        queues = _read_queues(target)
        if urls:
            queues[key] = {"urls": list(urls), "options": options, "saved": time.time()}
        else:
            queues.pop(key, None)
        _write_queues(target, queues)


def remove_queue(key: Optional[str], path: Optional[Path] = None) -> None:
    if key:
        save_queue(key, [], {}, path)


def load_queue(path: Optional[Path] = None, exclude: Optional[Set[str]] = None) -> Optional[Dict[str, Any]]:
    """The most recently saved unfinished queue as ``{key, urls, options}``, or None when there is none."""
    queues = _read_queues(path or queue_path())
    candidates = [(entry["saved"], key) for key, entry in queues.items() if key not in (exclude or set())]
    if not candidates:
        return None
    key = max(candidates)[1]
    return {"key": key, "urls": queues[key]["urls"], "options": queues[key]["options"]}


def pending_queue() -> Optional[Dict[str, Any]]:
    """The unfinished queue to offer for resuming; queues still downloading own their entries and are left out."""
    with _active_batches_lock:
        active = set(_active_batches)
    return load_queue(exclude=active)


def discard_queue() -> None:
    """Forget the queue that ``pending_queue`` offers."""
    saved = pending_queue()
    if saved:
        remove_queue(saved["key"])


class ActiveBatchQueue:
    def __init__(
        self,
        ctx: JobContext,
        cookies: Optional[Dict[str, Optional[str]]],
        saved_options: Optional[Dict[str, Any]] = None,
    ) -> None:
        """``saved_options`` (the batch parameters) turn on saving the unfinished links after every change."""
        self.ctx = ctx
        self.cookies = cookies
        self.saved_options = saved_options
        self.lock = threading.Lock()
        self.items: List[Dict[str, Any]] = []
        self.results: List[Dict[str, Any]] = []
        self.finished: Set[int] = set()
        self.cursor: int = 0
        # Set under ``lock`` once the loop has taken its last item; later URLs need a new batch.
        self.closed = False

    def remaining_urls(self) -> List[str]:
        with self.lock:
            return [item["url"] for item in self.items if item["index"] not in self.finished]

    def save(self) -> None:
        if self.saved_options is None:
            return
        try:
            save_queue(self.ctx.job_id, self.remaining_urls(), self.saved_options)
        except OSError as exc:
            self.ctx.log("download.log.queueNotSaved", "warning", error=str(exc))

    def add_urls(self, urls: List[str], report: bool = False) -> Optional[int]:
        """Queue ``urls``; None when the batch has already finished and they were not added."""
        expanded = expand_batch_urls(urls, self.cookies, self.ctx, report)
        added_count = 0
        with self.lock:
            if self.closed:
                return None
            for item in expanded:
                idx = len(self.items)
                entry = {"index": idx, "url": item["url"], "title": item["title"]}
                self.items.append(entry)
                self.ctx.partial({**entry, "status": "pending"})
                added_count += 1
            urls_now = [item["url"] for item in self.items]
        # Kept in the job's history even when the queue never finishes and leaves no result.
        self.ctx.describe(urls=urls_now)
        self.save()
        return added_count


_active_batches: Dict[str, ActiveBatchQueue] = {}
_active_batches_lock = threading.Lock()


def add_to_batch(job_id: Optional[str], urls: List[str]) -> bool:
    """Add URLs to an active batch download."""
    clean_urls = [u.strip() for u in urls if u and u.strip()]
    if not clean_urls:
        return False
    with _active_batches_lock:
        queue = None
        if job_id and job_id in _active_batches:
            queue = _active_batches[job_id]
        elif not job_id and _active_batches:
            queue = list(_active_batches.values())[-1]

    if not queue:
        return False

    try:
        return queue.add_urls(clean_urls) is not None
    except JobCancelled:
        return False


def download_batch(
    ctx: JobContext,
    urls: List[str],
    outdir: str,
    filename_template: str = DEFAULT_TEMPLATE,
    cookies: Optional[Dict[str, Optional[str]]] = None,
    subtitles: Optional[Dict[str, Any]] = None,
    mode: str = "video",
    audio_codec: str = "mp3",
    max_height: int = 0,
    embed_meta: bool = False,
    skip_archived: bool = False,
    archive: Optional[str] = None,
    persist: bool = False,
    replaces: Optional[str] = None,
    sponsorblock: bool = False,
) -> Dict[str, Any]:
    """Download several URLs; per-item state is streamed via ``ctx.partial``.

    ``mode`` is ``video`` (best quality up to ``max_height``) or ``audio`` (converted to ``audio_codec``).
    With ``persist``, the links not finished yet are kept in ``queue_path()`` until the batch ends normally.
    ``replaces`` is the saved queue this batch takes over (resumed or replaced); it is removed once this
    batch has saved its own links.
    """
    ctx.progress(None, "download.status.probing")
    Path(outdir).expanduser().mkdir(parents=True, exist_ok=True)
    template = output_template(outdir, filename_template)
    mode = "audio" if mode == "audio" else "video"
    target_codec = audio_codec if audio_codec in AUDIO_CODECS else "mp3"
    target_ext = target_codec if mode == "audio" else "mp4"
    fmt = batch_format(mode, max_height)
    saved_options = {
        "outdir": outdir,
        "template": filename_template,
        "subtitles": subtitles,
        "mode": mode,
        "audioCodec": target_codec,
        "maxHeight": max_height,
        "sponsorblock": sponsorblock,
    }

    batch_queue = ActiveBatchQueue(ctx, cookies, saved_options if persist else None)
    with _active_batches_lock:
        _active_batches[ctx.job_id] = batch_queue

    finished_normally = False
    try:
        batch_queue.add_urls(urls, report=True)
        if persist and replaces:
            try:
                remove_queue(replaces)
            except OSError as exc:
                ctx.log("download.log.queueNotSaved", "warning", error=str(exc))

        while True:
            ctx.check_cancelled()
            with batch_queue.lock:
                if batch_queue.cursor >= len(batch_queue.items):
                    batch_queue.closed = True
                    break
                current_item = batch_queue.items[batch_queue.cursor]
                index = batch_queue.cursor
                batch_queue.cursor += 1
                total = len(batch_queue.items)

            url = current_item["url"]
            ctx.partial({"index": index, "url": url, "title": current_item["title"], "status": "running"})
            slot = 100 / max(1, total)
            share = SUBTITLE_SHARE if _wants_subtitles(subtitles) else 0.0
            hook = _ProgressHook(ctx, scale=(1 - share) / max(1, total), offset=index * slot, item=index)
            opts = _download_opts(url, fmt, template, mode, target_codec, cookies or {}, hook, embed_meta, archive, sponsorblock)

            t0 = time.monotonic()
            try:
                info = _run_ydl(ctx, url, opts, target_ext=target_ext, photos=mode != "audio", skip_archived=skip_archived)
                if info.get("skipped"):
                    entry = {
                        "index": index,
                        "url": url,
                        "title": info.get("title") or current_item["title"],
                        "status": "skipped",
                    }
                    ctx.log("download.log.itemSkipped", url=url)
                    with batch_queue.lock:
                        batch_queue.results.append(entry)
                        batch_queue.finished.add(index)
                    ctx.partial(entry)
                    batch_queue.save()
                    continue
                if share:
                    info["subtitles"] = add_subtitles(
                        ctx, url, info["path"], subtitles or {}, cookies or {},
                        index * slot + slot * (1 - share), slot * share,
                    )
                duration = round(time.monotonic() - t0, 1)
                entry = {
                    "index": index,
                    "url": url,
                    "title": info.get("title") or current_item["title"],
                    "status": "done",
                    "duration": duration,
                    **info,
                }
            except JobCancelled:
                ctx.partial({"index": index, "url": url, "title": current_item["title"], "status": "cancelled"})
                raise
            except Exception as exc:  # noqa: BLE001 - keep going with the rest of the queue
                duration = round(time.monotonic() - t0, 1)
                err_msg = clean_error_message(str(exc))
                entry = {
                    "index": index,
                    "url": url,
                    "title": current_item["title"],
                    "status": "error",
                    "duration": duration,
                    "error": err_msg,
                }
                ctx.log("download.log.itemFailed", "error", url=url, error=err_msg)

            with batch_queue.lock:
                batch_queue.results.append(entry)
                batch_queue.finished.add(index)
            ctx.partial(entry)
            batch_queue.save()

            with batch_queue.lock:
                more_items = batch_queue.cursor < len(batch_queue.items)
            if more_items and not ctx.cancelled:
                time.sleep(1.5)

        ctx.progress(100, "download.status.batchDone")
        results = batch_queue.results
        total_size = sum(
            r["size"] for r in results if r.get("status") == "done" and isinstance(r.get("size"), (int, float))
        )
        total_duration = sum(
            r["duration"] for r in results if isinstance(r.get("duration"), (int, float))
        )
        finished_normally = True
        return {
            "items": results,
            "succeeded": sum(1 for r in results if r["status"] == "done"),
            "failed": sum(1 for r in results if r["status"] == "error"),
            "skipped": sum(1 for r in results if r["status"] == "skipped"),
            "totalSize": total_size,
            "totalDuration": round(total_duration, 1),
            "outdir": str(Path(outdir).expanduser()),
        }
    finally:
        with batch_queue.lock:
            batch_queue.closed = True
        with _active_batches_lock:
            _active_batches.pop(ctx.job_id, None)
        if persist and finished_normally:
            try:
                remove_queue(ctx.job_id)
            except OSError:
                pass

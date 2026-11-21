"""Batch downloads: the running queue, links added to it and the unfinished queue saved for resuming."""

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

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
MAX_PARALLEL = 3
# Pause each download thread keeps between two links, so sites do not answer "too many requests".
ITEM_PAUSE_S = 1.5
# The queue's progress (every running link at once) goes out at most this often.
REPORT_INTERVAL_S = 0.25
SCHEDULER_POLL_S = 0.2
MEGABYTE = 1024 * 1024
ITEM_STATS = ("downloaded", "total", "speed", "eta")
# Finished queues whose failed links "Retry failed" can still start again with the queue's own options.
MAX_FINISHED_BATCHES = 20


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


class _ItemContext(JobContext):
    """One link of a queue: the queue gathers its progress, and skipping it stops only this link."""

    def __init__(self, queue: "ActiveBatchQueue", index: int) -> None:
        super().__init__(queue.ctx.job_id)
        self.queue = queue
        self.index = index
        self.stats: Dict[str, Any] = {}

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set() or self.queue.ctx.cancelled

    @property
    def skipped(self) -> bool:
        return self._cancel.is_set()

    def check_cancelled(self) -> None:
        if self.cancelled:
            raise JobCancelled()

    def progress(
        self,
        percent: Optional[float] = None,
        message: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        force: bool = False,
        **extra: Any,
    ) -> None:
        if percent is not None:
            self.percent = max(0.0, min(100.0, float(percent)))
        if message is not None:
            self.message = message
            self.params = params or {}
        self.stats = {key: extra[key] for key in ITEM_STATS if extra.get(key) is not None}
        self.queue.report(force)

    def log(self, message: str, level: str = "info", **params: Any) -> None:
        self.queue.ctx.log(message, level, **params)

    def partial(self, data: Any) -> None:
        self.queue.ctx.partial(data)


DownloadOne = Callable[[_ItemContext, Dict[str, Any]], Dict[str, Any]]


class ActiveBatchQueue:
    def __init__(
        self,
        ctx: JobContext,
        cookies: Optional[Dict[str, Optional[str]]],
        saved_options: Optional[Dict[str, Any]] = None,
        parallel: int = 1,
    ) -> None:
        """``saved_options`` (the batch parameters) turn on saving the unfinished links after every change.

        ``parallel`` links (1 to MAX_PARALLEL) download at once.
        """
        self.ctx = ctx
        self.cookies = cookies
        self.saved_options = saved_options
        self.parallel = max(1, min(MAX_PARALLEL, parallel))
        self.lock = threading.Condition()
        # Every link ever added; a link's index is its place here and never changes.
        self.items: List[Dict[str, Any]] = []
        # The order the user sees; links still waiting download in this order.
        self.order: List[int] = []
        self.pending: List[int] = []
        self.running: Dict[int, _ItemContext] = {}
        self.results: Dict[int, Dict[str, Any]] = {}
        # Download threads in use, counting their pause after a link.
        self.busy = 0
        # Set under ``lock`` once nothing is waiting or running; later URLs need a new batch.
        self.closed = False
        self._save_lock = threading.Lock()
        self._report_lock = threading.Lock()
        self._last_report = 0.0

    def _base(self, index: int) -> Dict[str, Any]:
        item = self.items[index]
        return {"index": index, "url": item["url"], "title": item["title"]}

    def remaining_urls(self) -> List[str]:
        with self.lock:
            return [self.items[index]["url"] for index in self.order if index not in self.results]

    def save(self) -> None:
        if self.saved_options is None:
            return
        with self._save_lock:
            try:
                save_queue(self.ctx.job_id, self.remaining_urls(), self.saved_options)
            except OSError as exc:
                self.ctx.log("download.log.queueNotSaved", "warning", error=str(exc))

    def report(self, force: bool = False) -> None:
        """Send the state of every running link in one progress event, at most every REPORT_INTERVAL_S."""
        with self._report_lock:
            now = time.monotonic()
            if not force and now - self._last_report < REPORT_INTERVAL_S:
                return
            self._last_report = now
            with self.lock:
                total = len(self.items)
                finished = len(self.results)
                order = list(self.order)
                contexts = [self.running[index] for index in self.order if index in self.running]
                running = [{"index": c.index, "percent": c.percent or 0.0, **c.stats} for c in contexts]
            extra: Dict[str, Any] = {"running": running, "order": order}
            speeds = [item["speed"] for item in running if isinstance(item.get("speed"), (int, float))]
            if speeds:
                extra["speed"] = sum(speeds)
            message: Optional[str] = None
            params: Optional[Dict[str, Any]] = None
            if len(contexts) == 1:
                stats = contexts[0].stats
                extra.update({key: stats[key] for key in ("downloaded", "total", "eta") if key in stats})
                message = contexts[0].message or "download.status.downloading"
                params = contexts[0].params
            elif contexts:
                message, params = "download.status.downloadingMany", {"count": len(contexts)}
            percent = (finished * 100 + sum(item["percent"] for item in running)) / max(1, total)
            self.ctx.progress(min(percent, 99.9), message, params, force=True, **extra)

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
                self.order.append(idx)
                self.pending.append(idx)
                self.ctx.partial({**entry, "status": "pending"})
                added_count += 1
            urls_now = [item["url"] for item in self.items]
            self.lock.notify_all()
        # Kept in the job's history even when the queue never finishes and leaves no result.
        self.ctx.describe(urls=urls_now)
        self.save()
        return added_count

    def reorder(self, order: List[Any]) -> bool:
        """Show the links in ``order`` (indexes); waiting ones download in that order. Unknown indexes are ignored."""
        with self.lock:
            if self.closed:
                return False
            known = set(range(len(self.items)))
            wanted = [i for i in dict.fromkeys(order) if isinstance(i, int) and not isinstance(i, bool) and i in known]
            listed = set(wanted)
            self.order = wanted + [i for i in self.order if i not in listed]
            waiting = set(self.pending)
            self.pending = [i for i in self.order if i in waiting]
        self.save()
        self.report(force=True)
        return True

    def skip(self, index: int) -> bool:
        """Leave out a waiting link, or stop a running one; the rest of the queue goes on."""
        with self.lock:
            if self.closed:
                return False
            item_ctx = self.running.get(index)
            entry: Optional[Dict[str, Any]] = None
            if item_ctx is None:
                if index not in self.pending:
                    return False
                self.pending.remove(index)
                entry = {**self._base(index), "status": "cancelled"}
                self.results[index] = entry
        if item_ctx is not None:
            item_ctx.cancel()
            return True
        self.ctx.partial(entry)
        self.save()
        self.report(force=True)
        return True

    def retry_failed(self) -> int:
        """Queue the failed links again, at the end; how many, or 0 when the queue has already finished."""
        with self.lock:
            if self.closed:
                return 0
            failed = [i for i in self.order if self.results.get(i, {}).get("status") == "error"]
            for index in failed:
                del self.results[index]
                self.pending.append(index)
            self.lock.notify_all()
        for index in failed:
            self.ctx.partial({**self._base(index), "status": "pending", "error": None})
        if failed:
            self.save()
            self.report(force=True)
        return len(failed)

    def failed_urls(self) -> List[str]:
        with self.lock:
            return [self.items[i]["url"] for i in self.order if self.results.get(i, {}).get("status") == "error"]

    def ordered_results(self) -> List[Dict[str, Any]]:
        with self.lock:
            return [self.results[i] for i in self.order if i in self.results]

    def run(self, download_one: DownloadOne) -> None:
        """Download the waiting links, ``parallel`` at once, until none is left; links added meanwhile are taken too."""
        threads: List[threading.Thread] = []
        try:
            while True:
                with self.lock:
                    if self.ctx.cancelled:
                        break
                    while self.busy < self.parallel and self.pending:
                        index = self.pending.pop(0)
                        item_ctx = _ItemContext(self, index)
                        self.running[index] = item_ctx
                        self.busy += 1
                        thread = threading.Thread(
                            target=self._work, args=(item_ctx, download_one), name=f"batch-{index}", daemon=True
                        )
                        threads.append(thread)
                        thread.start()
                    if not self.pending and self.busy == 0:
                        self.closed = True
                        break
                    self.lock.wait(SCHEDULER_POLL_S)
        finally:
            for thread in threads:
                thread.join()
        self.ctx.check_cancelled()

    def _work(self, item_ctx: _ItemContext, download_one: DownloadOne) -> None:
        index = item_ctx.index
        with self.lock:
            base = self._base(index)
        entry: Optional[Dict[str, Any]] = None
        try:
            self.ctx.partial({**base, "status": "running"})
            self.report(force=True)
            entry = download_one(item_ctx, base)
        except JobCancelled:
            if item_ctx.skipped and not self.ctx.cancelled:
                entry = {**base, "status": "cancelled"}
                self.ctx.log("download.log.itemCancelled", url=base["url"])
            else:
                self.ctx.cancel()
                self.ctx.partial({**base, "status": "cancelled"})
        except Exception as exc:  # noqa: BLE001 - one broken link must not stop the others
            entry = {**base, "status": "error", "error": clean_error_message(str(exc))}
            self.ctx.log("download.log.itemFailed", "error", url=base["url"], error=entry["error"])
        with self.lock:
            self.running.pop(index, None)
            if entry is not None:
                self.results[index] = entry
        if entry is not None:
            self.ctx.partial(entry)
            self.save()
        self.report(force=True)
        with self.lock:
            more = bool(self.pending)
        try:
            if more and not self.ctx.cancelled:
                time.sleep(ITEM_PAUSE_S)
        finally:
            with self.lock:
                self.busy -= 1
                self.lock.notify_all()


_active_batches: Dict[str, ActiveBatchQueue] = {}
_active_batches_lock = threading.Lock()
_finished_batches: Dict[str, Dict[str, Any]] = {}
# Finished queues whose failed links were handed out for a retry in this run of the app.
_retried_batches: Set[str] = set()


def _active(job_id: Optional[str]) -> Optional[ActiveBatchQueue]:
    with _active_batches_lock:
        return _active_batches.get(job_id) if job_id else None


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


def reorder_batch(job_id: str, order: List[Any]) -> bool:
    queue = _active(job_id)
    return bool(queue and queue.reorder(order))


def skip_batch_item(job_id: str, index: int) -> bool:
    queue = _active(job_id)
    return bool(queue and queue.skip(index))


def saved_failures(entry: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """``{"urls", "options"}`` of a finished queue's failed links from its job history entry, or None."""
    replay = (entry or {}).get("replay") or {}
    args = replay.get("args") or []
    if replay.get("method") != "download.batch" or not args or not isinstance(args[0], dict):
        return None
    urls = [
        item["url"]
        for item in entry.get("items") or []
        if isinstance(item, dict) and item.get("status") == "error" and isinstance(item.get("url"), str)
    ]
    options = {key: value for key, value in args[0].items() if key != "urls"}
    return {"urls": urls, "options": options} if urls else None


def retry_failed(
    job_id: str, saved: Optional[Callable[[], Optional[Dict[str, Any]]]] = None
) -> Optional[Dict[str, Any]]:
    """Retry the failed links of a queue.

    A running queue takes them again itself and the result is ``{"requeued": n}``; a finished one gives
    ``{"urls", "options"}`` to start a new queue with, handed out once. A queue from before a restart is
    read from its job history entry, which ``saved`` returns. None when there is nothing to retry.
    """
    queue = _active(job_id)
    if queue:
        count = queue.retry_failed()
        if count:
            return {"requeued": count}
    with _active_batches_lock:
        finished = _finished_batches.pop(job_id, None)
        if job_id in _retried_batches:
            return None
        if finished and finished["urls"]:
            _retried_batches.add(job_id)
            return finished
    found = saved_failures(saved()) if saved else None
    with _active_batches_lock:
        if not found or job_id in _retried_batches:
            return None
        _retried_batches.add(job_id)
    return found


def _remember_failures(job_id: str, queue: ActiveBatchQueue, options: Dict[str, Any]) -> None:
    urls = queue.failed_urls()
    with _active_batches_lock:
        _finished_batches.pop(job_id, None)
        _retried_batches.discard(job_id)
        if urls:
            _finished_batches[job_id] = {"urls": urls, "options": options}
        while len(_finished_batches) > MAX_FINISHED_BATCHES:
            _finished_batches.pop(next(iter(_finished_batches)))


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
    parallel: int = 1,
    rate_limit: int = 0,
) -> Dict[str, Any]:
    """Download several URLs; per-item state is streamed via ``ctx.partial``, running items via ``ctx.progress``.

    ``mode`` is ``video`` (best quality up to ``max_height``) or ``audio`` (converted to ``audio_codec``).
    With ``persist``, the links not finished yet are kept in ``queue_path()`` until the batch ends normally.
    ``replaces`` is the saved queue this batch takes over (resumed or replaced); it is removed once this
    batch has saved its own links. Without ``persist`` and ``replaces`` the batch runs on its own and
    leaves the user's saved queue alone.
    ``parallel`` links download at once; ``rate_limit`` (bytes/s, 0 for none) is shared between them.
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

    batch_queue = ActiveBatchQueue(ctx, cookies, saved_options if persist else None, parallel)
    share = SUBTITLE_SHARE if _wants_subtitles(subtitles) else 0.0
    thread_limit = rate_limit // batch_queue.parallel if rate_limit > 0 else None

    def download_one(item_ctx: _ItemContext, base: Dict[str, Any]) -> Dict[str, Any]:
        url = base["url"]
        hook = _ProgressHook(item_ctx, scale=1 - share, item=base["index"])
        opts = _download_opts(
            url, fmt, template, mode, target_codec, cookies or {}, hook, embed_meta, archive, sponsorblock,
            ratelimit=thread_limit,
        )
        t0 = time.monotonic()
        try:
            info = _run_ydl(item_ctx, url, opts, target_ext=target_ext, photos=mode != "audio", skip_archived=skip_archived)
            if info.get("skipped"):
                ctx.log("download.log.itemSkipped", url=url)
                return {**base, "title": info.get("title") or base["title"], "status": "skipped"}
            if share:
                info["subtitles"] = add_subtitles(
                    item_ctx, url, info["path"], subtitles or {}, cookies or {}, 100 * (1 - share), 100 * share
                )
            return {
                **base,
                **info,
                "title": info.get("title") or base["title"],
                "status": "done",
                "duration": round(time.monotonic() - t0, 1),
            }
        except JobCancelled:
            raise
        except Exception as exc:  # noqa: BLE001 - keep going with the rest of the queue
            err_msg = clean_error_message(str(exc))
            ctx.log("download.log.itemFailed", "error", url=url, error=err_msg)
            return {**base, "status": "error", "duration": round(time.monotonic() - t0, 1), "error": err_msg}

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

        batch_queue.run(download_one)

        ctx.progress(100, "download.status.batchDone", running=[], order=list(batch_queue.order))
        results = batch_queue.ordered_results()
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
        _remember_failures(ctx.job_id, batch_queue, saved_options)
        if persist and finished_normally:
            try:
                remove_queue(ctx.job_id)
            except OSError:
                pass

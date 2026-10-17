"""YouTube / X (Twitter) / generic video downloads via yt-dlp."""

import math
from pathlib import Path
import re
import threading
import time
from typing import Any, Dict, List, Optional

import yt_dlp

from backend.core import thumbs
from backend.core.jobs import JobCancelled, JobContext

AUTO_FORMAT = "bestvideo+bestaudio/best"
AUTO_FORMAT_YOUTUBE = AUTO_FORMAT
AUTO_FORMAT_GENERIC = AUTO_FORMAT
AUDIO_CODECS = ("mp3", "wav", "m4a", "flac", "aac", "opus")
DEFAULT_TEMPLATE = "{title}.{ext}"
ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def clean_error_message(msg: str) -> str:
    cleaned = ANSI_ESCAPE_RE.sub("", msg).strip()
    if cleaned.startswith("ERROR:"):
        cleaned = cleaned[len("ERROR:") :].strip()
    return cleaned
# yt-dlp enables only deno by default. Without a JS runtime YouTube falls back to clients whose
# streams fail with HTTP 403 part-way through, so allow every runtime yt-dlp can use.
JS_RUNTIMES = ("deno", "node", "bun", "quickjs")


def fmt_bytes(n: Optional[float]) -> str:
    if not n or n == float("inf"):
        return "Unknown Size"
    n = int(n)
    units = ["B", "KB", "MB", "GB", "TB"]
    i = min(int(math.floor(math.log(n, 1024))), len(units) - 1)
    return f"{round(n / math.pow(1024, i), 2)} {units[i]}"


def is_youtube(url: str) -> bool:
    url_lower = url.lower()
    return "youtube.com" in url_lower or "youtu.be" in url_lower


def is_x(url: str) -> bool:
    url_lower = url.lower()
    return "x.com" in url_lower or "twitter.com" in url_lower


def sanitize_x_url(url: str) -> str:
    """Strip trailing ``/video/N`` markers from X/Twitter URLs (they cause 404s)."""
    url = url.strip()
    if is_x(url) and "/video/" in url:
        url = url.split("/video/")[0]
    return url


def cookie_file_for(url: str, cookies: Dict[str, Optional[str]]) -> Optional[str]:
    if is_youtube(url):
        path = cookies.get("youtube")
    elif is_x(url):
        path = cookies.get("x")
    else:
        return None
    return path if path and Path(path).is_file() else None


def output_template(outdir: str, filename_template: str = DEFAULT_TEMPLATE) -> str:
    template = (filename_template or DEFAULT_TEMPLATE).strip()
    template = template.replace("{title}", "%(title)s").replace("{ext}", "%(ext)s").replace("{id}", "%(id)s")
    return str(Path(outdir).expanduser() / template)


def _base_opts(url: str, cookies: Dict[str, Optional[str]]) -> Dict[str, Any]:
    opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "no_color": True,
        "overwrites": False,
        "continuedl": True,
        "retries": 5,
        "fragment_retries": 10,
        "sleep_interval_requests": 0.5,
        "retry_sleep_functions": {"http": lambda n: min(3.0 * (n + 1), 30.0)},
        "js_runtimes": {name: {} for name in JS_RUNTIMES},
    }
    cookie = cookie_file_for(url, cookies)
    if cookie:
        opts["cookiefile"] = cookie
    return opts


def classify_formats(url: str, raw_formats: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Split yt-dlp formats into video / audio / muxed lists, largest first.

    The synthetic "auto" entry (best video + best audio) heads the video and muxed lists.
    """
    auto = {
        "id": AUTO_FORMAT,
        "kind": "auto",
        "ext": "mp4",
        "height": None,
        "fps": None,
        "vcodec": "auto",
        "acodec": "auto",
        "filesize": None,
        "note": "",
    }
    video, audio, muxed = [], [], []
    seen_video = set()

    for f in raw_formats:
        ext = f.get("ext") or ""
        if not ext or "mhtml" in ext.lower():
            continue
        vcodec = f.get("vcodec") or ""
        acodec = f.get("acodec") or ""
        height = f.get("height")
        if not vcodec and not acodec and not height:
            continue

        has_video = bool(vcodec) and vcodec != "none"
        has_audio = bool(acodec) and acodec != "none"
        entry = {
            "id": str(f.get("format_id") or f.get("id") or ""),
            "ext": ext,
            "height": height,
            "fps": f.get("fps"),
            "vcodec": vcodec,
            "acodec": acodec,
            "filesize": f.get("filesize") or f.get("filesize_approx") or None,
            "abr": f.get("abr"),
            "note": f.get("format_note") or "",
        }

        if has_video and not has_audio:
            entry["kind"] = "video"
            key = (height, ext, entry["filesize"])
            if key not in seen_video:
                seen_video.add(key)
                video.append(entry)
        elif has_audio and not has_video:
            entry["kind"] = "audio"
            audio.append(entry)
        else:
            entry["kind"] = "muxed"
            video.append(entry)
            muxed.append(entry)

    def by_size(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return sorted(items, key=lambda x: x.get("filesize") or 0, reverse=True)

    return {"video": [auto, *by_size(video)], "audio": by_size(audio), "muxed": [auto, *by_size(muxed)]}


def _fetch_thumbnail(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        import requests

        resp = requests.get(url, timeout=5)
        if resp.status_code == 200 and resp.content:
            return thumbs.to_data_url(resp.content, (480, 270))
    except Exception:  # noqa: BLE001 - a missing thumbnail is not an error
        pass
    return None


def probe(ctx: JobContext, url: str, cookies: Dict[str, Optional[str]]) -> Dict[str, Any]:
    import yt_dlp

    url = sanitize_x_url(url)
    ctx.progress(None, "download.status.probing")
    opts = _base_opts(url, cookies)
    opts["extract_flat"] = "in_playlist"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    ctx.check_cancelled()
    ctx.progress(90, "download.status.thumbnail")

    if info and (info.get("_type") == "playlist" or info.get("entries")):
        raw_entries = list(info.get("entries") or [])
        entries = []
        seen = set()
        playlist_title = info.get("title") or ""
        for idx, e in enumerate(raw_entries):
            entry_url = e.get("url") or e.get("webpage_url") or ""
            if not entry_url and e.get("id"):
                if "cda.pl" in url.lower():
                    entry_url = f"https://www.cda.pl/video/{e.get('id')}"
                elif "youtube.com" in url.lower() or "youtu.be" in url.lower():
                    entry_url = f"https://www.youtube.com/watch?v={e.get('id')}"
                else:
                    entry_url = str(e.get("id"))
            if entry_url and entry_url not in seen:
                seen.add(entry_url)
                title = e.get("title")
                if not title:
                    title = f"{playlist_title} [{idx + 1}]" if playlist_title else entry_url
                entries.append({
                    "url": entry_url,
                    "title": title,
                    "id": str(e.get("id") or ""),
                    "duration": e.get("duration"),
                })
        auto = {
            "id": AUTO_FORMAT,
            "kind": "auto",
            "ext": "mp4",
            "height": None,
            "fps": None,
            "vcodec": "auto",
            "acodec": "auto",
            "filesize": None,
            "note": "",
        }
        return {
            "url": url,
            "title": playlist_title or url,
            "uploader": info.get("uploader") or info.get("channel") or "",
            "duration": None,
            "viewCount": None,
            "thumbnail": _fetch_thumbnail(info.get("thumbnail")),
            "isPlaylist": True,
            "entries": entries,
            "formats": {"video": [auto], "audio": [], "muxed": [auto]},
        }

    return {
        "url": url,
        "title": info.get("title") or "",
        "uploader": info.get("uploader") or info.get("channel") or "",
        "duration": info.get("duration"),
        "viewCount": info.get("view_count"),
        "thumbnail": _fetch_thumbnail(info.get("thumbnail")),
        "isPlaylist": False,
        "entries": [],
        "formats": classify_formats(url, info.get("formats") or []),
    }


class _ProgressHook:
    """yt-dlp progress hook forwarding to a JobContext; raising here aborts the download."""

    def __init__(self, ctx: JobContext, scale: float = 1.0, offset: float = 0.0, item: Optional[int] = None):
        self.ctx = ctx
        self.scale = scale
        self.offset = offset
        self.item = item

    def __call__(self, d: Dict[str, Any]) -> None:
        if self.ctx.cancelled:
            raise JobCancelled()
        status = d.get("status")
        if status == "downloading":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            item_percent = downloaded * 100 / total if total else 0
            stats = {
                "downloaded": downloaded,
                "total": total,
                "speed": d.get("speed"),
                "eta": d.get("eta"),
                "itemPercent": item_percent,
            }
            if self.item is not None:
                stats["item"] = self.item
            self.ctx.progress(self.offset + item_percent * self.scale, "download.status.downloading", **stats)
        elif status == "finished":
            self.ctx.progress(None if self.item is None else self.offset + 100 * self.scale, "download.status.postprocessing")


def _download_opts(
    url: str,
    format_id: str,
    out_template: str,
    mode: str,
    audio_codec: str,
    cookies: Dict[str, Optional[str]],
    hook: _ProgressHook,
) -> Dict[str, Any]:
    opts = _base_opts(url, cookies)
    opts.update({"format": format_id, "outtmpl": out_template, "progress_hooks": [hook]})
    if mode == "audio":
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": audio_codec, "preferredquality": "192"}
        ]
    else:
        opts["merge_output_format"] = "mp4"
        opts["postprocessors"] = [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}]
    return opts


def resolve_format(url: str, format_id: str, mode: str) -> str:
    """Resolve the format string passed to yt-dlp."""
    if not format_id or format_id in (AUTO_FORMAT, AUTO_FORMAT_YOUTUBE, AUTO_FORMAT_GENERIC, "auto", "best"):
        return "bestaudio/best" if mode == "audio" else AUTO_FORMAT
    if mode == "video" and "+" not in format_id:
        return f"{format_id}+bestaudio/{format_id}"
    return format_id


class UniqueYoutubeDL(yt_dlp.YoutubeDL):
    """YoutubeDL subclass that prevents overwriting / skipping by appending (1), (2), etc.
    when the target destination file already exists."""

    def __init__(self, *args: Any, target_ext: Optional[str] = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.target_ext = target_ext.lower().lstrip(".") if target_ext else None

    def _prepare_filename(
        self, info_dict: Dict[str, Any], *, outtmpl: Optional[str] = None, tmpl_type: Optional[str] = None
    ) -> Optional[str]:
        fn = super()._prepare_filename(info_dict, outtmpl=outtmpl, tmpl_type=tmpl_type)
        if not fn or fn == "-":
            return fn

        if "_unique_stem" not in info_dict:
            p = Path(fn)
            target_ext = f".{self.target_ext}" if self.target_ext else p.suffix
            target_path = p.with_suffix(target_ext)
            if target_path.exists() or p.exists():
                stem = p.stem
                parent = p.parent
                counter = 1
                while True:
                    cand_target = parent / f"{stem} ({counter}){target_ext}"
                    cand_raw = parent / f"{stem} ({counter}){p.suffix}"
                    if not cand_target.exists() and not cand_raw.exists():
                        break
                    counter += 1
                info_dict["_unique_stem"] = f"{stem} ({counter})"
            else:
                info_dict["_unique_stem"] = p.stem

        unique_stem = info_dict["_unique_stem"]
        p = Path(fn)
        return str(p.parent / f"{unique_stem}{p.suffix}")


def _run_ydl(ctx: JobContext, url: str, opts: Dict[str, Any], target_ext: Optional[str] = None) -> Dict[str, Any]:
    try:
        with UniqueYoutubeDL(opts, target_ext=target_ext) as ydl:
            info = ydl.extract_info(url, download=True)
            path = info.get("filepath") or ydl.prepare_filename(info)
            p = Path(path)
            if not p.is_file() and target_ext:
                cand = p.with_suffix(f".{target_ext}")
                if cand.is_file():
                    p = cand
                    path = str(cand)
            file_size = p.stat().st_size if p.is_file() else (info.get("filesize") or info.get("filesize_approx"))
            return {"title": info.get("title") or "", "path": path, "size": file_size}
    except JobCancelled:
        raise
    except Exception as exc:
        if ctx.cancelled:
            raise JobCancelled()
        cleaned = clean_error_message(str(exc))
        raise RuntimeError(cleaned) from exc


def download(
    ctx: JobContext,
    url: str,
    format_id: str,
    outdir: str,
    filename_template: str = DEFAULT_TEMPLATE,
    mode: str = "video",
    audio_codec: str = "mp3",
    cookies: Optional[Dict[str, Optional[str]]] = None,
) -> Dict[str, Any]:
    """Download one URL. ``mode`` is ``video`` | ``audio`` | ``muxed``."""
    t0 = time.monotonic()
    url = sanitize_x_url(url)
    Path(outdir).expanduser().mkdir(parents=True, exist_ok=True)
    target_codec = audio_codec if audio_codec in AUDIO_CODECS else "mp3"
    opts = _download_opts(
        url,
        resolve_format(url, format_id, mode),
        output_template(outdir, filename_template),
        mode,
        target_codec,
        cookies or {},
        _ProgressHook(ctx),
    )
    target_ext = target_codec if mode == "audio" else "mp4"
    ctx.progress(0, "download.status.starting")
    result = _run_ydl(ctx, url, opts, target_ext=target_ext)
    duration = round(time.monotonic() - t0, 1)
    ctx.progress(100, "download.status.done")
    return {**result, "duration": duration, "outdir": str(Path(outdir).expanduser())}


def expand_batch_urls(
    urls: List[str], cookies: Optional[Dict[str, Optional[str]]] = None
) -> List[Dict[str, Any]]:
    """Expand playlist/folder URLs into individual video items with flat extraction."""
    items: List[Dict[str, Any]] = []
    seen_urls: set = set()

    for raw_url in urls:
        url = sanitize_x_url(raw_url)
        if not url:
            continue
        try:
            import yt_dlp

            opts = _base_opts(url, cookies or {})
            opts["extract_flat"] = True
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)

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


class ActiveBatchQueue:
    def __init__(
        self,
        ctx: JobContext,
        cookies: Optional[Dict[str, Optional[str]]],
    ) -> None:
        self.ctx = ctx
        self.cookies = cookies
        self.lock = threading.Lock()
        self.items: List[Dict[str, Any]] = []
        self.results: List[Dict[str, Any]] = []
        self.cursor: int = 0

    def add_urls(self, urls: List[str]) -> int:
        expanded = expand_batch_urls(urls, self.cookies)
        added_count = 0
        with self.lock:
            for item in expanded:
                idx = len(self.items)
                entry = {"index": idx, "url": item["url"], "title": item["title"]}
                self.items.append(entry)
                self.ctx.partial({**entry, "status": "pending"})
                added_count += 1
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

    queue.add_urls(clean_urls)
    return True


def download_batch(
    ctx: JobContext,
    urls: List[str],
    outdir: str,
    filename_template: str = DEFAULT_TEMPLATE,
    cookies: Optional[Dict[str, Optional[str]]] = None,
) -> Dict[str, Any]:
    """Download several URLs with best quality; per-item state is streamed via ``ctx.partial``."""
    ctx.progress(None, "download.status.probing")
    Path(outdir).expanduser().mkdir(parents=True, exist_ok=True)
    template = output_template(outdir, filename_template)

    batch_queue = ActiveBatchQueue(ctx, cookies)
    with _active_batches_lock:
        _active_batches[ctx.job_id] = batch_queue

    try:
        batch_queue.add_urls(urls)

        while True:
            ctx.check_cancelled()
            with batch_queue.lock:
                if batch_queue.cursor >= len(batch_queue.items):
                    break
                current_item = batch_queue.items[batch_queue.cursor]
                index = batch_queue.cursor
                batch_queue.cursor += 1
                total = len(batch_queue.items)

            url = current_item["url"]
            ctx.partial({"index": index, "url": url, "title": current_item["title"], "status": "running"})
            hook = _ProgressHook(ctx, scale=1 / max(1, total), offset=index * 100 / max(1, total), item=index)
            fmt = AUTO_FORMAT
            opts = _download_opts(url, fmt, template, "video", "mp3", cookies or {}, hook)

            t0 = time.monotonic()
            try:
                info = _run_ydl(ctx, url, opts, target_ext="mp4")
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
            ctx.partial(entry)

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
        return {
            "items": results,
            "succeeded": sum(1 for r in results if r["status"] == "done"),
            "failed": sum(1 for r in results if r["status"] == "error"),
            "totalSize": total_size,
            "totalDuration": round(total_duration, 1),
            "outdir": str(Path(outdir).expanduser()),
        }
    finally:
        with _active_batches_lock:
            _active_batches.pop(ctx.job_id, None)

"""YouTube / X (Twitter) / generic video downloads via yt-dlp."""

import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core import thumbs
from backend.core.jobs import JobCancelled, JobContext

AUTO_FORMAT_YOUTUBE = "bestvideo+bestaudio/best"
AUTO_FORMAT_GENERIC = "best"
AUDIO_CODECS = ("mp3", "wav", "m4a", "flac", "aac", "opus")
DEFAULT_TEMPLATE = "{title}.{ext}"


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
    opts: Dict[str, Any] = {"quiet": True, "no_warnings": True, "noplaylist": True}
    cookie = cookie_file_for(url, cookies)
    if cookie:
        opts["cookiefile"] = cookie
    return opts


def classify_formats(url: str, raw_formats: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Split yt-dlp formats into video / audio / muxed lists, largest first.

    The synthetic "auto" entry (best video + best audio) heads the video and muxed lists.
    """
    auto = {
        "id": AUTO_FORMAT_YOUTUBE if is_youtube(url) else AUTO_FORMAT_GENERIC,
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
    with yt_dlp.YoutubeDL(_base_opts(url, cookies)) as ydl:
        info = ydl.extract_info(url, download=False)

    ctx.check_cancelled()
    ctx.progress(90, "download.status.thumbnail")
    return {
        "url": url,
        "title": info.get("title") or "",
        "uploader": info.get("uploader") or info.get("channel") or "",
        "duration": info.get("duration"),
        "viewCount": info.get("view_count"),
        "thumbnail": _fetch_thumbnail(info.get("thumbnail")),
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
    """YouTube video-only streams need the best audio merged in."""
    if (
        is_youtube(url)
        and mode == "video"
        and format_id not in (AUTO_FORMAT_YOUTUBE, AUTO_FORMAT_GENERIC)
        and "+" not in format_id
    ):
        return f"{format_id}+bestaudio"
    return format_id


def _run_ydl(ctx: JobContext, url: str, opts: Dict[str, Any]) -> Dict[str, Any]:
    import yt_dlp

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return {"title": info.get("title") or "", "path": ydl.prepare_filename(info)}
    except JobCancelled:
        raise
    except Exception:
        if ctx.cancelled:
            raise JobCancelled()
        raise


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
    url = sanitize_x_url(url)
    Path(outdir).expanduser().mkdir(parents=True, exist_ok=True)
    opts = _download_opts(
        url,
        resolve_format(url, format_id, mode),
        output_template(outdir, filename_template),
        mode,
        audio_codec if audio_codec in AUDIO_CODECS else "mp3",
        cookies or {},
        _ProgressHook(ctx),
    )
    ctx.progress(0, "download.status.starting")
    result = _run_ydl(ctx, url, opts)
    ctx.progress(100, "download.status.done")
    return {**result, "outdir": str(Path(outdir).expanduser())}


def download_batch(
    ctx: JobContext,
    urls: List[str],
    outdir: str,
    filename_template: str = DEFAULT_TEMPLATE,
    cookies: Optional[Dict[str, Optional[str]]] = None,
) -> Dict[str, Any]:
    """Download several URLs with best quality; per-item state is streamed via ``ctx.partial``."""
    cleaned = [sanitize_x_url(u) for u in urls if u and u.strip()]
    Path(outdir).expanduser().mkdir(parents=True, exist_ok=True)
    template = output_template(outdir, filename_template)
    total = len(cleaned)
    results: List[Dict[str, Any]] = []

    for index, url in enumerate(cleaned):
        ctx.check_cancelled()
        ctx.partial({"index": index, "url": url, "status": "running"})
        hook = _ProgressHook(ctx, scale=1 / total, offset=index * 100 / total, item=index)
        fmt = AUTO_FORMAT_YOUTUBE if is_youtube(url) else AUTO_FORMAT_GENERIC
        opts = _download_opts(url, fmt, template, "video", "mp3", cookies or {}, hook)
        try:
            info = _run_ydl(ctx, url, opts)
            entry = {"index": index, "url": url, "status": "done", **info}
        except JobCancelled:
            ctx.partial({"index": index, "url": url, "status": "cancelled"})
            raise
        except Exception as exc:  # noqa: BLE001 - keep going with the rest of the queue
            entry = {"index": index, "url": url, "status": "error", "error": str(exc)}
            ctx.log("download.log.itemFailed", "error", url=url, error=str(exc))
        results.append(entry)
        ctx.partial(entry)

    ctx.progress(100, "download.status.batchDone")
    return {
        "items": results,
        "succeeded": sum(1 for r in results if r["status"] == "done"),
        "failed": sum(1 for r in results if r["status"] == "error"),
        "outdir": str(Path(outdir).expanduser()),
    }

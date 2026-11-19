"""YouTube / X (Twitter) / generic video downloads via yt-dlp."""

import glob
import json
import math
from pathlib import Path
import re
import subprocess
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple
from urllib.parse import urlparse

import yt_dlp
import yt_dlp.postprocessor.ffmpeg as yt_dlp_ffmpeg
from yt_dlp.extractor.tiktok import TikTokIE, TikTokUserIE
from yt_dlp.networking import Request
from yt_dlp.postprocessor import EmbedThumbnailPP, PostProcessor
from yt_dlp.utils import ExtractorError, Popen, PostProcessingError, mimetype2ext, traverse_obj, url_or_none

from backend.core import thumbs, whisper_models
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import app_data_dir, unique_path
from backend.services import transcribe

AUTO_FORMAT = "bestvideo+bestaudio/best"
AUTO_FORMAT_YOUTUBE = AUTO_FORMAT
AUTO_FORMAT_GENERIC = AUTO_FORMAT
AUDIO_CODECS = ("mp3", "wav", "m4a", "flac", "aac", "opus")
# Audio formats yt-dlp can put a cover image into; the others only get the metadata.
COVER_CODECS = ("mp3", "m4a", "flac", "opus")
DEFAULT_TEMPLATE = "{title}.{ext}"
SUBTITLE_MODES = ("site", "auto")
# Share of a download's progress bar left for subtitles (fetching them or transcribing with Whisper).
SUBTITLE_SHARE = 0.3
NO_SUBTITLE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def clean_error_message(msg: str) -> str:
    cleaned = ANSI_ESCAPE_RE.sub("", msg).strip()
    if cleaned.startswith("ERROR:"):
        cleaned = cleaned[len("ERROR:") :].strip()
    return cleaned
# yt-dlp enables only deno by default. Without a JS runtime YouTube falls back to clients whose
# streams fail with HTTP 403 part-way through, so allow every runtime yt-dlp can use.
JS_RUNTIMES = ("deno", "node", "bun", "quickjs")
TIKTOK_PAGE_ATTEMPTS = 4
# HLS/DASH streams (X, many generic sites) arrive as thousands of few-second fragments; fetched one
# at a time, a download is bound by per-request latency instead of bandwidth.
FRAGMENT_WORKERS = 8


class TikTokProfileIE(TikTokUserIE):
    """TikTok profile listing that survives TikTok's bot checks.

    yt-dlp requests the profile's item_list API without browser impersonation, so TikTok answers
    roughly every other run with an empty body and the whole profile fails on page 1. Impersonating
    the browser makes those pages load; a failed page is retried instead of aborting the listing.
    """

    def _download_json(self, url_or_request: Any, video_id: str, *args: Any, **kwargs: Any) -> Any:
        if url_or_request != self._API_BASE_URL:
            return super()._download_json(url_or_request, video_id, *args, **kwargs)
        kwargs["impersonate"] = True
        for attempt in range(TIKTOK_PAGE_ATTEMPTS):
            try:
                return super()._download_json(url_or_request, video_id, *args, **kwargs)
            except ExtractorError:
                if attempt == TIKTOK_PAGE_ATTEMPTS - 1:
                    raise
                time.sleep(2.0 * (attempt + 1))


TIKTOK_PHOTOS_KEY = "tiktok_photos"


class TikTokPostIE(TikTokIE):
    """TikTok post that also accepts ``/photo/`` links and keeps the images of photo posts.

    yt-dlp handles only ``/video/`` links and reduces a photo post to its soundtrack. Each entry
    under ``TIKTOK_PHOTOS_KEY`` lists the mirror URLs of one image.
    """

    _VALID_URL = TikTokIE._VALID_URL.replace(")/video)/", ")/(?:video|photo))/")

    def _parse_aweme_video_web(
        self, aweme_detail: Dict[str, Any], webpage_url: str, video_id: str, extract_flat: bool = False
    ) -> Dict[str, Any]:
        info = super()._parse_aweme_video_web(aweme_detail, webpage_url, video_id, extract_flat)
        photos = [
            mirrors
            for mirrors in traverse_obj(aweme_detail, ("imagePost", "images", ..., "imageURL", "urlList"))
            if isinstance(mirrors, list) and any(url_or_none(u) for u in mirrors)
        ]
        if photos:
            info[TIKTOK_PHOTOS_KEY] = photos
        return info


def fmt_bytes(n: Optional[float]) -> str:
    if not n or n == float("inf"):
        return "Unknown Size"
    n = int(n)
    units = ["B", "KB", "MB", "GB", "TB"]
    i = min(int(math.floor(math.log(n, 1024))), len(units) - 1)
    return f"{round(n / math.pow(1024, i), 2)} {units[i]}"


def _host_is(url: str, *domains: str) -> bool:
    """``url``'s host is one of ``domains`` or below one (``m.youtube.com`` yes, ``netflix.com`` no)."""
    url = url.strip()
    host = (urlparse(url if "://" in url else f"https://{url}").hostname or "").lower()
    return any(host == d or host.endswith(f".{d}") for d in domains)


def is_youtube(url: str) -> bool:
    return _host_is(url, "youtube.com", "youtu.be", "youtube-nocookie.com")


def is_x(url: str) -> bool:
    return _host_is(url, "x.com", "twitter.com")


def is_instagram(url: str) -> bool:
    return _host_is(url, "instagram.com")


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
    elif is_instagram(url):
        path = cookies.get("instagram")
    else:
        return None
    return path if path and Path(path).is_file() else None


# X answers requests without a logged-in session with these errors, even for public video posts.
X_LOGIN_HINTS = ("No video could be found", "requires authentication", "not authorized")
COOKIE_BROWSERS = ("firefox", "chrome", "edge", "brave", "opera", "vivaldi")
# yt-dlp cannot read a running Chromium browser's cookie database, nor decrypt app-bound cookies.
BROWSER_COOKIE_HINTS = ("cookie database", "decrypt", "DPAPI", "cookies from browser")
SPONSOR_CATEGORIES = ["sponsor", "selfpromo", "interaction"]


def browser_cookies(cookies: Dict[str, Optional[str]]) -> Optional[str]:
    browser = cookies.get("browser") or ""
    return browser if browser in COOKIE_BROWSERS else None


def explain_error(url: str, opts: Dict[str, Any], exc: Exception) -> str:
    """Cleaned yt-dlp error, or an i18n key when an X post failed because no cookie file was used."""
    message = clean_error_message(str(exc))
    if opts.get("cookiesfrombrowser") and any(hint.lower() in message.lower() for hint in BROWSER_COOKIE_HINTS):
        return f"download.error.browserCookies|{json.dumps({'browser': opts['cookiesfrombrowser'][0]})}"
    logged_in = opts.get("cookiefile") or opts.get("cookiesfrombrowser")
    if is_x(url) and not logged_in and any(hint in message for hint in X_LOGIN_HINTS):
        return "download.error.xLoginRequired"
    return message


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
        "retry_sleep_functions": {
            "http": lambda n: min(3.0 * (n + 1), 30.0),
            "fragment": lambda n: min(1.0 * (n + 1), 10.0),
        },
        "js_runtimes": {name: {} for name in JS_RUNTIMES},
    }
    cookie = cookie_file_for(url, cookies)
    if cookie:
        opts["cookiefile"] = cookie
    elif browser_cookies(cookies):
        opts["cookiesfrombrowser"] = (browser_cookies(cookies),)
    return opts


def _extract(ydl: yt_dlp.YoutubeDL, url: str, **kwargs: Any) -> Optional[Dict[str, Any]]:
    for ie_class in (TikTokProfileIE, TikTokPostIE):
        if ie_class.suitable(url):
            ie = ie_class()
            ydl.add_info_extractor(ie)
            return ydl.extract_info(url, ie_key=ie.ie_key(), **kwargs)
    return ydl.extract_info(url, **kwargs)


def _extract_listing(url: str, opts: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with yt_dlp.YoutubeDL(opts) as ydl:
        return _extract(ydl, url, download=False)


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


def _fetch_thumbnail(url: Optional[str], size: Tuple[int, int] = (480, 270)) -> Optional[str]:
    if not url:
        return None
    try:
        import requests

        resp = requests.get(url, timeout=5)
        if resp.status_code == 200 and resp.content:
            return thumbs.to_data_url(resp.content, size)
    except Exception:  # noqa: BLE001 - a missing thumbnail is not an error
        pass
    return None


def probe(ctx: JobContext, url: str, cookies: Dict[str, Optional[str]]) -> Dict[str, Any]:
    url = sanitize_x_url(url)
    ctx.progress(None, "download.status.probing")
    opts = _base_opts(url, cookies)
    opts["extract_flat"] = "in_playlist"
    try:
        info = _extract_listing(url, opts)
    except yt_dlp.utils.DownloadError as exc:
        raise RuntimeError(explain_error(url, opts, exc)) from exc
    if not info:
        raise RuntimeError("download.error.noMedia")

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
        "photoCount": len(info.get(TIKTOK_PHOTOS_KEY) or []),
        "chapters": [
            {"title": c.get("title") or "", "start": float(c.get("start_time") or 0), "end": float(c.get("end_time") or 0)}
            for c in info.get("chapters") or []
        ],
        "entries": [],
        "formats": classify_formats(url, info.get("formats") or []),
    }


# Thumbnail size on the job card; small enough to keep in the job history.
CARD_THUMB_SIZE = (128, 72)


def media_summary(info: Dict[str, Any]) -> Dict[str, Any]:
    """What the job card shows about a downloaded video: resolution, container, length, author, site."""
    height = info.get("height")
    if not height:
        heights = [f.get("height") for f in info.get("requested_formats") or [] if f.get("height")]
        height = max(heights) if heights else None
    return {
        "height": height,
        "ext": info.get("ext"),
        "length": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel"),
        "site": info.get("extractor_key"),
    }


def _stream_size(fmt: Dict[str, Any]) -> float:
    return float(fmt.get("filesize") or fmt.get("filesize_approx") or 0)


def _is_audio_only(fmt: Dict[str, Any]) -> bool:
    return fmt.get("vcodec") == "none" and fmt.get("acodec") not in (None, "none")


class _InfoPP(PostProcessor):
    """Runs once the formats are chosen, before anything is downloaded."""

    def __init__(self, hook: "_ProgressHook") -> None:
        super().__init__()
        self.hook = hook

    def run(self, info: Dict[str, Any]):  # type: ignore[override]
        self.hook.set_info(info)
        return [], info


class _ProgressHook:
    """yt-dlp progress hook forwarding to a JobContext; raising here aborts the download.

    A video downloaded as separate video and audio streams reports each stream from 0 to 100%;
    the hook weighs them by size so the job's percent keeps rising across both.
    """

    def __init__(self, ctx: JobContext, scale: float = 1.0, offset: float = 0.0, item: Optional[int] = None):
        self.ctx = ctx
        self.scale = scale
        self.offset = offset
        self.item = item
        self.tmpfiles: Set[str] = set()
        self.streams: List[Dict[str, Any]] = []

    def set_info(self, info: Dict[str, Any]) -> None:
        self.streams = list(info.get("requested_formats") or [])
        if self.item is not None:
            return
        self.ctx.describe(**media_summary(info))
        thumb_url = info.get("thumbnail")
        if thumb_url:
            threading.Thread(target=self._send_thumb, args=(thumb_url,), daemon=True).start()

    def _send_thumb(self, url: str) -> None:
        thumb = _fetch_thumbnail(url, CARD_THUMB_SIZE)
        if thumb and not self.ctx.cancelled:
            self.ctx.describe(thumb=thumb)

    def _stream_index(self, d: Dict[str, Any]) -> Optional[int]:
        format_id = (d.get("info_dict") or {}).get("format_id")
        for index, fmt in enumerate(self.streams):
            if fmt.get("format_id") == format_id:
                return index
        return None

    def __call__(self, d: Dict[str, Any]) -> None:
        if d.get("tmpfilename"):
            self.tmpfiles.add(d["tmpfilename"])
        if self.ctx.cancelled:
            raise JobCancelled()
        status = d.get("status")
        if status == "downloading":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            item_percent = downloaded * 100 / total if total else 0
            stats: Dict[str, Any] = {
                "downloaded": downloaded,
                "total": total,
                "speed": d.get("speed"),
                "eta": d.get("eta"),
                "itemPercent": item_percent,
            }
            message = "download.status.downloading"
            params: Dict[str, Any] = {}
            stream = self._stream_index(d) if len(self.streams) > 1 else None
            if stream is not None:
                sizes = [_stream_size(f) for f in self.streams]
                sizes[stream] = float(total) or sizes[stream]
                if all(sizes):
                    before = sum(sizes[:stream])
                    stats["downloaded"] = before + downloaded
                    stats["total"] = sum(sizes)
                    item_percent = (before + sizes[stream] * item_percent / 100) * 100 / sum(sizes)
                else:
                    item_percent = (stream + item_percent / 100) * 100 / len(self.streams)
                stats["itemPercent"] = item_percent
                audio = _is_audio_only(self.streams[stream])
                message = "download.status.downloadingAudio" if audio else "download.status.downloadingVideo"
                params = {"stream": stream + 1, "streams": len(self.streams)}
            if self.item is not None:
                stats["item"] = self.item
            self.ctx.progress(self.offset + item_percent * self.scale, message, params, **stats)
        elif status == "finished":
            stream = self._stream_index(d) if len(self.streams) > 1 else None
            if stream is not None and stream < len(self.streams) - 1:
                return
            self.ctx.progress(None if self.item is None else self.offset + 100 * self.scale, "download.status.postprocessing")


def _download_opts(
    url: str,
    format_id: str,
    out_template: str,
    mode: str,
    audio_codec: str,
    cookies: Dict[str, Optional[str]],
    hook: _ProgressHook,
    embed_meta: bool = False,
    archive: Optional[str] = None,
    sponsorblock: bool = False,
    section: Optional[Tuple[float, float]] = None,
) -> Dict[str, Any]:
    """yt-dlp options for one download; ``archive`` is the file that records every finished download.

    ``sponsorblock`` cuts sponsor segments out of YouTube videos; ``section`` keeps only (start, end) seconds.
    """
    opts = _base_opts(url, cookies)
    opts.update({
        "format": format_id,
        "outtmpl": out_template,
        "progress_hooks": [hook],
        "concurrent_fragment_downloads": FRAGMENT_WORKERS,
    })
    if mode == "audio":
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": audio_codec, "preferredquality": "192"}
        ]
    else:
        opts["merge_output_format"] = "mp4"
        opts["postprocessors"] = [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}]
    if sponsorblock and is_youtube(url):
        opts["postprocessors"].insert(0, {"key": "SponsorBlock", "categories": SPONSOR_CATEGORIES, "when": "after_filter"})
        opts["postprocessors"].append({"key": "ModifyChapters", "remove_sponsor_segments": SPONSOR_CATEGORIES})
    if section:
        opts["download_ranges"] = yt_dlp.utils.download_range_func(None, [section])
        opts["force_keyframes_at_cuts"] = True
    if embed_meta:
        opts["postprocessors"].append({"key": "FFmpegMetadata", "add_metadata": True})
        opts["writethumbnail"] = mode != "audio" or audio_codec in COVER_CODECS
    if archive:
        opts["download_archive"] = archive
    return opts


def parse_section(section: Optional[Dict[str, Any]]) -> Optional[Tuple[float, float]]:
    """(start, end) in seconds from ``{start, end}``; None for the whole video or a range that is empty."""
    if not section:
        return None
    try:
        start = max(0.0, float(section.get("start") or 0))
        end = float(section.get("end") or 0)
    except (TypeError, ValueError):
        return None
    return (start, end) if end > start else None


def batch_format(mode: str, max_height: int = 0) -> str:
    """Format for a queued link: the best audio, or the best video up to ``max_height`` (0 = no limit)."""
    if mode == "audio":
        return "bestaudio/best"
    if max_height > 0:
        return f"bestvideo[height<={max_height}]+bestaudio/best[height<={max_height}]/best"
    return AUTO_FORMAT


def archive_path() -> Path:
    """yt-dlp's download archive: one ``<site> <id>`` line per finished download."""
    return app_data_dir() / "download_archive.txt"


def archive_count(path: Optional[Path] = None) -> int:
    try:
        lines = (path or archive_path()).read_text(encoding="utf-8").splitlines()
    except OSError:
        return 0
    return len({line.strip() for line in lines if line.strip()})


def clear_archive(path: Optional[Path] = None) -> None:
    (path or archive_path()).unlink(missing_ok=True)


class _CoverPP(EmbedThumbnailPP):
    """Embeds the cover image; a failure keeps the downloaded file and only logs a warning."""

    def run(self, info: Dict[str, Any]):  # type: ignore[override]
        try:
            return super().run(info)
        except PostProcessingError as exc:
            self.report_warning(f"Cover not embedded: {exc}")
            leftovers = [t.get("filepath") for t in info.get("thumbnails") or [] if t.get("filepath")]
            return leftovers, info


def resolve_format(url: str, format_id: str, mode: str) -> str:
    """Resolve the format string passed to yt-dlp."""
    if not format_id or format_id in (AUTO_FORMAT, AUTO_FORMAT_YOUTUBE, AUTO_FORMAT_GENERIC, "auto", "best"):
        return "bestaudio/best" if mode == "audio" else AUTO_FORMAT
    if mode == "video" and "+" not in format_id:
        return f"{format_id}+bestaudio/{format_id}"
    return format_id


# Windows paths stop at 260 characters; yt-dlp's work files add up to ~25 (".f137.webm.part", " (2)").
MAX_PATH_CHARS = 230
MAX_STEM_CHARS = 150
MIN_STEM_CHARS = 16


def fit_stem(parent: Path, stem: str, suffix: str) -> str:
    """``stem`` shortened so the file and its work files stay within the Windows path limit."""
    room = max(MIN_STEM_CHARS, min(MAX_STEM_CHARS, MAX_PATH_CHARS - len(str(parent)) - len(suffix) - 1))
    if len(stem) <= room:
        return stem
    return stem[:room].rstrip(" .") or stem[:room]


# The job whose yt-dlp download runs on this thread; its FFmpeg steps stop when it is cancelled.
_running_job = threading.local()
CANCEL_POLL_S = 0.2


class _CancellablePopen(Popen):
    """yt-dlp's FFmpeg steps (merging, conversion to MP3, metadata) wait for FFmpeg with no way to stop
    it; this one kills FFmpeg as soon as the job on the calling thread is cancelled."""

    @classmethod
    def run(cls, *args: Any, timeout: Optional[float] = None, input: Any = None, **kwargs: Any) -> Tuple[Any, Any, int]:
        ctx: Optional[JobContext] = getattr(_running_job, "ctx", None)
        if ctx is None:
            return super().run(*args, timeout=timeout, input=input, **kwargs)
        if input is not None and kwargs.get("stdin") is None:
            kwargs["stdin"] = subprocess.PIPE
        text = kwargs.get("encoding") or kwargs.get("errors") or kwargs.get("text") or kwargs.get("universal_newlines")
        with cls(*args, **kwargs) as proc:
            finished = threading.Event()

            def stop_on_cancel() -> None:
                while not finished.wait(CANCEL_POLL_S):
                    if ctx.cancelled:
                        proc.kill()
                        return

            threading.Thread(target=stop_on_cancel, daemon=True).start()
            try:
                stdout, stderr = proc.communicate_or_kill(input=input, timeout=timeout)
            finally:
                finished.set()
        ctx.check_cancelled()
        empty = "" if text else b""
        return stdout or empty, stderr or empty, proc.returncode


yt_dlp_ffmpeg.Popen = _CancellablePopen


@contextmanager
def _ffmpeg_stops_with(ctx: JobContext) -> Iterator[None]:
    previous = getattr(_running_job, "ctx", None)
    _running_job.ctx = ctx
    try:
        yield
    finally:
        _running_job.ctx = previous


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
            stem = fit_stem(p.parent, p.stem, max(target_ext, p.suffix, key=len))
            unique, counter = stem, 1
            while (p.parent / f"{unique}{target_ext}").exists() or (p.parent / f"{unique}{p.suffix}").exists():
                unique = f"{stem} ({counter})"
                counter += 1
            info_dict["_unique_stem"] = unique

        unique_stem = info_dict["_unique_stem"]
        p = Path(fn)
        return str(p.parent / f"{unique_stem}{p.suffix}")


def _download_photos(ydl: yt_dlp.YoutubeDL, info: Dict[str, Any], hook: "_ProgressHook") -> Dict[str, Any]:
    """Save every image of a TikTok photo post as ``<name> 1.jpg``, ``<name> 2.jpg``…"""
    photos = info[TIKTOK_PHOTOS_KEY]
    base = Path(ydl.prepare_filename({**info, "ext": "jpg"}))
    headers = {"Referer": info.get("webpage_url") or ""}
    paths: List[Path] = []
    total = 0
    for number, mirrors in enumerate(photos, 1):
        last_error: Optional[Exception] = None
        for image_url in filter(url_or_none, mirrors):
            try:
                with ydl.urlopen(Request(image_url, headers=headers)) as resp:
                    data = resp.read()
                    ext = mimetype2ext(resp.headers.get("Content-Type")) or "jpg"
                break
            except Exception as exc:  # noqa: BLE001 - try the next mirror
                last_error = exc
        else:
            raise RuntimeError(f"Photo {number}/{len(photos)}: {last_error}")
        path = unique_path(base.with_name(f"{base.stem.rstrip()} {number}.{ext}"))
        path.write_bytes(data)
        paths.append(path)
        total += len(data)
        hook({"status": "downloading", "downloaded_bytes": total, "total_bytes_estimate": total * len(photos) / number})
    hook({"status": "finished"})
    return {"title": info.get("title") or "", "path": str(paths[0]), "size": total}


def _remove_fragment_leftovers(hook: _ProgressHook) -> None:
    """Delete the ``<name>.part-FragN`` files a cancelled parallel fragment download leaves behind.

    The ``.part`` and ``.ytdl`` files stay so that downloading the same URL again resumes.
    """
    for tmpfile in hook.tmpfiles:
        path = Path(tmpfile)
        for leftover in path.parent.glob(f"{glob.escape(path.name)}-Frag*"):
            leftover.unlink(missing_ok=True)


def _close_fragment_streams(exc: BaseException) -> None:
    """Close the ``.part`` file an interrupted yt-dlp fragment download leaves open.

    yt-dlp's fragment downloader closes its output stream only on success, so the open handle lives
    on in the traceback; on Windows it blocks renaming the ``.part`` when the same URL is downloaded
    again in this session. Its per-download state is a dict holding ``dest_stream``.
    """
    tb = exc.__traceback__
    while tb is not None:
        for value in list(tb.tb_frame.f_locals.values()):
            stream = value.get("dest_stream") if isinstance(value, dict) else None
            if stream is not None and hasattr(stream, "close"):
                stream.close()
        tb = tb.tb_next


def _run_ydl(
    ctx: JobContext,
    url: str,
    opts: Dict[str, Any],
    target_ext: Optional[str] = None,
    photos: bool = False,
    skip_archived: bool = False,
) -> Dict[str, Any]:
    """Download ``url``; with ``photos``, a TikTok photo post saves its images instead of its soundtrack.

    With ``skip_archived``, a link already in the download archive is not downloaded and the result
    is ``{"skipped": True, "title": …}``; otherwise the archive is only written to.
    """
    hook = opts["progress_hooks"][0]
    try:
        with _ffmpeg_stops_with(ctx), UniqueYoutubeDL(opts, target_ext=target_ext) as ydl:
            if not skip_archived:
                ydl.archive = set()
            ydl.add_post_processor(_InfoPP(hook), when="video")
            if opts.get("writethumbnail"):
                ydl.add_post_processor(_CoverPP(ydl), when="post_process")
            info = _extract(ydl, url, download=False, process=False)
            if skip_archived and ydl.in_download_archive(info):
                return {"skipped": True, "title": info.get("title") or ""}
            if photos and TikTokPostIE.suitable(url) and info.get(TIKTOK_PHOTOS_KEY):
                return _download_photos(ydl, info, hook)
            info = ydl.process_ie_result(info, download=True)
            path = info.get("filepath") or ydl.prepare_filename(info)
            p = Path(path)
            if not p.is_file() and target_ext:
                cand = p.with_suffix(f".{target_ext}")
                if cand.is_file():
                    p = cand
                    path = str(cand)
            if not p.is_file() and skip_archived and ydl.in_download_archive(info):
                return {"skipped": True, "title": info.get("title") or ""}
            file_size = p.stat().st_size if p.is_file() else (info.get("filesize") or info.get("filesize_approx"))
            summary = media_summary(info)
            if p.suffix:
                summary["ext"] = p.suffix.lstrip(".").lower()
            return {
                "title": info.get("title") or "",
                "path": path,
                "size": file_size,
                "height": summary["height"],
                "ext": summary["ext"],
                "length": summary["length"],
            }
    except JobCancelled as exc:
        _close_fragment_streams(exc)
        _remove_fragment_leftovers(hook)
        raise
    except Exception as exc:
        _close_fragment_streams(exc)
        if ctx.cancelled:
            _remove_fragment_leftovers(hook)
            raise JobCancelled()
        raise RuntimeError(explain_error(url, opts, exc)) from exc


def _wants_subtitles(subtitles: Optional[Dict[str, Any]]) -> bool:
    return bool(subtitles) and subtitles.get("mode") in SUBTITLE_MODES


def _fetch_site_subtitles(
    url: str, media_path: Path, languages: List[str], cookies: Dict[str, Optional[str]]
) -> List[str]:
    """Saves the site's own subtitles (made by people, else automatic) as ``<name>.<lang>.srt``."""
    stem = str(media_path.with_suffix("")).replace("%", "%%")
    opts = _base_opts(url, cookies)
    opts.update({
        "skip_download": True,
        "noprogress": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": languages,
        "subtitlesformat": "srt/vtt/best",
        "outtmpl": {"default": f"{stem}.%(ext)s"},
        "postprocessors": [{"key": "FFmpegSubtitlesConvertor", "format": "srt"}],
    })
    pattern = f"{glob.escape(str(media_path.with_suffix('')))}.*.srt"
    before = set(glob.glob(pattern))
    with yt_dlp.YoutubeDL(opts) as ydl:
        _extract(ydl, url, download=True)
    return sorted(set(glob.glob(pattern)) - before)


def add_subtitles(
    ctx: JobContext,
    url: str,
    media_path: str,
    subtitles: Dict[str, Any],
    cookies: Dict[str, Optional[str]],
    progress_start: float,
    progress_span: float,
) -> List[str]:
    """Subtitles for a downloaded file: from the site, else (mode ``auto``) transcribed with Whisper.

    Failures are logged as warnings; the download itself has already succeeded.
    """
    path = Path(media_path)
    if not _wants_subtitles(subtitles) or not path.is_file() or path.suffix.lower() in NO_SUBTITLE_EXTS:
        return []
    ctx.progress(progress_start, "download.status.subtitles")
    languages = [lang for lang in subtitles.get("languages") or [] if lang] or ["en"]
    try:
        files = _fetch_site_subtitles(url, path, languages, cookies)
    except JobCancelled:
        raise
    except Exception as exc:  # noqa: BLE001 - subtitles are optional
        ctx.check_cancelled()
        files = []
        ctx.log("download.log.subtitlesFailed", "warning", error=clean_error_message(str(exc)))
    if files:
        ctx.log("download.log.subtitlesSaved", files=", ".join(Path(f).name for f in files))
        return files
    if subtitles.get("mode") != "auto":
        ctx.log("download.log.noSubtitles")
        return []

    model = subtitles.get("model") or "small"
    if not whisper_models.is_ready(model):
        ctx.log("download.log.whisperMissing", "warning", model=model)
        return []
    ctx.log("download.log.whisperStarted", model=model)
    try:
        result = transcribe.transcribe_file(
            ctx,
            str(path),
            model,
            language=subtitles.get("language") or None,
            progress_start=progress_start,
            progress_span=progress_span,
        )
    except JobCancelled:
        raise
    except Exception as exc:  # noqa: BLE001 - keep the downloaded file
        ctx.log("download.log.whisperFailed", "warning", error=str(exc))
        return []
    target = path.with_suffix(f".{result['language']}.srt")
    transcribe.write_output("srt", str(target), result["segments"], result["words"])
    ctx.log("download.log.subtitlesSaved", files=target.name)
    return [str(target)]


def download(
    ctx: JobContext,
    url: str,
    format_id: str,
    outdir: str,
    filename_template: str = DEFAULT_TEMPLATE,
    mode: str = "video",
    audio_codec: str = "mp3",
    cookies: Optional[Dict[str, Optional[str]]] = None,
    subtitles: Optional[Dict[str, Any]] = None,
    embed_meta: bool = False,
    archive: Optional[str] = None,
    sponsorblock: bool = False,
    section: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Download one URL. ``mode`` is ``video`` | ``audio`` | ``muxed``.

    ``subtitles`` is ``{mode: off | site | auto, languages, model, language}`` (see add_subtitles).
    A single link is always downloaded, even when the archive already lists it.
    """
    t0 = time.monotonic()
    url = sanitize_x_url(url)
    ctx.describe(url=url)
    Path(outdir).expanduser().mkdir(parents=True, exist_ok=True)
    target_codec = audio_codec if audio_codec in AUDIO_CODECS else "mp3"
    share = SUBTITLE_SHARE if _wants_subtitles(subtitles) else 0.0
    opts = _download_opts(
        url,
        resolve_format(url, format_id, mode),
        output_template(outdir, filename_template),
        mode,
        target_codec,
        cookies or {},
        _ProgressHook(ctx, scale=1.0 - share),
        embed_meta,
        archive,
        sponsorblock,
        parse_section(section),
    )
    target_ext = target_codec if mode == "audio" else "mp4"
    ctx.progress(0, "download.status.starting")
    result = _run_ydl(ctx, url, opts, target_ext=target_ext, photos=mode != "audio")
    subtitle_files: List[str] = []
    if share:
        subtitle_files = add_subtitles(
            ctx, url, result["path"], subtitles or {}, cookies or {}, 100 * (1 - share), 100 * share
        )
    duration = round(time.monotonic() - t0, 1)
    ctx.progress(100, "download.status.done")
    return {**result, "subtitles": subtitle_files, "duration": duration, "outdir": str(Path(outdir).expanduser())}

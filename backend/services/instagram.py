"""Instagram posts, stories, highlights and whole profiles via yt-dlp's Instagram extractors."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import yt_dlp
from yt_dlp.extractor.instagram import InstagramBaseIE, InstagramIE
from yt_dlp.networking import Request
from yt_dlp.utils import mimetype2ext, sanitize_filename, traverse_obj, url_or_none

from backend.core import thumbs
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import unique_path
from backend.services.download import (
    AUTO_FORMAT,
    UniqueYoutubeDL,
    _base_opts,
    clean_error_message,
    cookie_file_for,
)

INSTAGRAM_MEDIA_KEY = "instagram_media"
# Fragments of yt-dlp errors for posts that need a logged-in session (age gate, private account).
LOGIN_HINTS = ("--cookies", "available to everyone", "login page", "logged-in")
THUMB_WIDTH = 360
THUMB_WORKERS = 6
CHUNK = 256 * 1024
PROFILE_BATCH = 12  # profile posts shown per update while the feed loads
LISTING_TTL_S = 20 * 60  # media URLs from a check stay valid for a while; downloads reuse them
REFERER = {"Referer": "https://www.instagram.com/"}

STORY_RE = re.compile(r"https?://(?:www\.)?instagram\.com/stories/(?P<user>[^/?#]+)(?:/(?P<id>\d+))?")
PROFILE_RE = re.compile(r"https?://(?:www\.)?instagram\.com/(?P<user>[A-Za-z0-9._]{1,30})/?(?:(?:reels|tagged)/?)?(?:[?#]|$)")
RESERVED_PATHS = {"p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal", "web", "api"}


def _largest(candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    return max(candidates, key=lambda c: (c.get("width") or 0) * (c.get("height") or 0), default=None)


def _thumb_candidate(candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Smallest image at least ``THUMB_WIDTH`` wide, so the preview does not fetch the full photo."""
    wide = [c for c in candidates if (c.get("width") or 0) >= THUMB_WIDTH]
    return min(wide, key=lambda c: c.get("width") or 0) if wide else _largest(candidates)


def _slide(media: Dict[str, Any]) -> Dict[str, Any]:
    images = traverse_obj(media, ("image_versions2", "candidates", lambda _, v: url_or_none(v["url"])))
    videos = traverse_obj(media, ("video_versions", lambda _, v: url_or_none(v["url"])))
    best = _largest(videos) or _largest(images) or {}
    return {
        "kind": "video" if videos else "image",
        "url": best.get("url"),
        "width": media.get("original_width") or best.get("width"),
        "height": media.get("original_height") or best.get("height"),
        "duration": media.get("video_duration"),
        "thumbnail": (_thumb_candidate(images) or {}).get("url"),
    }


def _slides(ie: InstagramBaseIE, product: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Every slide of a post in order. Video slides also carry yt-dlp ``formats``: the direct
    ``url`` is often a lower resolution than DASH."""
    slides = []
    for media in traverse_obj(product, ("carousel_media", ..., {dict})) or [product]:
        slide = _slide(media)
        if slide["kind"] == "video":
            slide["formats"] = ie._extract_product_media(media)["formats"]
        if slide["url"]:
            slides.append(slide)
    return slides


class InstagramPostIE(InstagramIE):
    """Instagram post that keeps its photos; yt-dlp extracts only the videos and rejects photo posts.

    The result is always a playlist whose ``INSTAGRAM_MEDIA_KEY`` lists every slide in order.
    """

    def _extract_product(self, product_info: Any, video_id: Optional[str] = None, get_comments: bool = True) -> Dict[str, Any]:
        info = super()._extract_product(product_info, video_id, get_comments=False)
        if isinstance(product_info, list):
            product_info = product_info[0]
        return {
            **info,
            "_type": "playlist",
            "entries": info.get("entries") or [],
            "shortcode": video_id or info.get("id"),
            INSTAGRAM_MEDIA_KEY: _slides(self, product_info),
        }


def _feed_extractor(url: str, cookie_file: Optional[str]) -> Any:
    """gallery-dl's Instagram extractor for a stories or ``/<user>/posts/`` link, logged in from ``cookie_file``.

    Instagram serves stories and profile feeds through GraphQL queries that change often; gallery-dl
    keeps up with them, while the REST endpoints yt-dlp uses answer 404/500. Its own pacing between
    requests keeps long profiles under the rate limit.
    """
    from gallery_dl import config as gdl_config
    from gallery_dl.extractor import instagram as gdl_instagram

    if not cookie_file:
        raise RuntimeError("instagram.error.loginRequired")
    gdl_config.clear()
    gdl_config.set(("extractor",), "cookies", cookie_file)
    gdl_config.set(("extractor",), "cookies-update", False)
    for cls in (gdl_instagram.InstagramStoriesExtractor, gdl_instagram.InstagramPostsExtractor):
        pattern = re.compile(cls.pattern) if isinstance(cls.pattern, str) else cls.pattern
        if match := pattern.match(url):
            extractor = cls(match)
            extractor.initialize()
            extractor.login()
            if not extractor._logged_in:
                raise RuntimeError("instagram.error.loginRequired")
            return extractor
    raise RuntimeError("instagram.error.notSupported")


def parse_url(url: str) -> Tuple[str, Dict[str, Optional[str]]]:
    """``("post" | "stories" | "highlight" | "profile", parts)`` for a supported Instagram link."""
    url = url.strip()
    if InstagramPostIE.suitable(url):
        return "post", {}
    story = STORY_RE.match(url)
    if story:
        if story["user"] == "highlights":
            if story["id"]:
                return "highlight", {"id": story["id"]}
        else:
            return "stories", {"user": story["user"], "id": story["id"]}
    profile = PROFILE_RE.match(url)
    if profile and profile["user"].lower() not in RESERVED_PATHS:
        return "profile", {"user": profile["user"]}
    raise RuntimeError("instagram.error.notSupported")


def _stem(*parts: Optional[str]) -> str:
    return sanitize_filename("_".join(filter(None, parts))) or "instagram"


def _extract_post(ydl: yt_dlp.YoutubeDL, url: str) -> Dict[str, Any]:
    ie = InstagramPostIE()
    ydl.add_info_extractor(ie)
    info = ydl.extract_info(url, ie_key=ie.ie_key(), download=False, process=False)
    if not info or not info.get(INSTAGRAM_MEDIA_KEY):
        raise RuntimeError("instagram.error.noMedia")
    return info


def _list(
    ydl: yt_dlp.YoutubeDL,
    url: str,
    cookie_file: Optional[str],
    on_page: Callable[[List[Dict[str, Any]]], None],
    should_stop: Callable[[], bool] = lambda: False,
) -> Dict[str, Any]:
    """Everything a link points to as entries (one file group each): ``{"kind", "uploader", "subdir", "entries"}``.

    A post lists its slides; stories list story items; a profile lists its posts, reported page by
    page, and ends early with what it has once ``should_stop`` returns True.
    """
    kind, parts = parse_url(url)
    if kind == "post":
        info = _extract_post(ydl, url)
        user, slides = info.get("channel"), info[INSTAGRAM_MEDIA_KEY]
        base = _stem(user, info.get("shortcode"))
        entries = [
            {"stem": f"{base}_{n}" if len(slides) > 1 else base, "slides": [slide]} for n, slide in enumerate(slides, 1)
        ]
        on_page(entries)
        return {"kind": kind, "uploader": user or "", "subdir": None, "entries": entries}

    parser = InstagramPostIE(ydl)

    if kind in ("stories", "highlight"):
        user = parts.get("user")
        reel_url = (
            f"https://www.instagram.com/stories/highlights/{parts['id']}/"
            if kind == "highlight"
            else f"https://www.instagram.com/stories/{user}/"
        )
        reels = list(_feed_extractor(reel_url, cookie_file).posts())
        user = user or traverse_obj(reels, (0, "user", "username", {str}))
        entries = []
        for item in traverse_obj(reels, (0, "items", ..., {dict})) or []:
            pk = str(item.get("pk") or "")
            if slides := _slides(parser, item):
                entries.append({"stem": _stem(user, "story", pk), "slides": slides, "pk": pk})
        if not entries:
            raise RuntimeError("instagram.error.noStories" if kind == "stories" else "instagram.error.noMedia")
        if parts.get("id") and kind == "stories":
            if not any(e["pk"] == parts["id"] for e in entries):
                raise RuntimeError("instagram.error.storyExpired")
            for e in entries:
                e["selected"] = e["pk"] == parts["id"]
        on_page(entries)
        return {"kind": "stories", "uploader": user or "", "subdir": None, "entries": entries}

    user = parts["user"]
    entries: List[Dict[str, Any]] = []
    batch: List[Dict[str, Any]] = []
    seen = set()
    for media in _feed_extractor(f"https://www.instagram.com/{user}/posts/", cookie_file).posts():
        code = media.get("code")
        if code not in seen:
            seen.add(code)
            if slides := _slides(parser, media):
                batch.append({"stem": _stem(user, code), "slides": slides})
            if len(batch) >= PROFILE_BATCH:
                entries.extend(batch)
                on_page(batch)
                batch = []
        # Checked after each post so a stop never waits for the next page request.
        if should_stop():
            break
    entries.extend(batch)
    on_page(batch)
    if not entries:
        raise RuntimeError("instagram.error.noPosts")
    return {"kind": kind, "uploader": user, "subdir": user, "entries": entries}


def _opts(url: str, cookies: Dict[str, Optional[str]]) -> Dict[str, Any]:
    opts = _base_opts(url, cookies)
    opts.pop("sleep_interval_requests", None)
    return opts


def _wrap_errors(ctx: JobContext, exc: Exception) -> Exception:
    if isinstance(exc, JobCancelled) or ctx.cancelled:
        return JobCancelled()
    from gallery_dl import exception as gdl_exception

    if isinstance(exc, gdl_exception.HttpError) and exc.status == 429:
        return RuntimeError("instagram.error.rateLimited")
    if isinstance(exc, gdl_exception.AuthorizationError):
        return RuntimeError("instagram.error.loginRequired")
    if isinstance(exc, gdl_exception.NotFoundError):
        return RuntimeError("instagram.error.noUser")
    message = clean_error_message(str(exc))
    if "HTTP Error 429" in message:
        return RuntimeError("instagram.error.rateLimited")
    if any(hint in message for hint in LOGIN_HINTS):
        return RuntimeError("instagram.error.loginRequired")
    return RuntimeError(message)


def _thumbnail(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        import requests

        resp = requests.get(url, headers=REFERER, timeout=10)
        if resp.status_code == 200 and resp.content:
            return thumbs.to_data_url(resp.content, (THUMB_WIDTH, THUMB_WIDTH))
    except Exception:  # noqa: BLE001 - a missing thumbnail is not an error
        pass
    return None


def _item(index: int, entry: Dict[str, Any], thumbnail: Optional[str]) -> Dict[str, Any]:
    slides = entry["slides"]
    first = slides[0]
    return {
        "index": index,
        "kind": "carousel" if len(slides) > 1 else first["kind"],
        "count": len(slides),
        "width": first["width"],
        "height": first["height"],
        "duration": first["duration"],
        "thumbnail": thumbnail,
        "selected": entry.get("selected", True),
    }


_listings: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_stop_requests: Set[str] = set()


def stop_listing(job_id: str) -> None:
    """Finish a running profile check with the posts loaded so far (cancelling discards them)."""
    _stop_requests.add(job_id)


def probe(ctx: JobContext, url: str, cookies: Dict[str, Optional[str]]) -> Dict[str, Any]:
    url = url.strip()
    parse_url(url)
    ctx.progress(None, "instagram.status.probing")
    items: List[Dict[str, Any]] = []

    def on_page(entries: List[Dict[str, Any]]) -> None:
        ctx.check_cancelled()
        with ThreadPoolExecutor(THUMB_WORKERS) as pool:
            previews = list(pool.map(_thumbnail, (e["slides"][0]["thumbnail"] for e in entries)))
        for entry, preview in zip(entries, previews):
            item = _item(len(items), entry, preview)
            items.append(item)
            ctx.partial(item)
        ctx.progress(None, "instagram.status.listing", {"count": len(items)})

    try:
        with yt_dlp.YoutubeDL(_opts(url, cookies)) as ydl:
            listing = _list(
                ydl, url, cookie_file_for(url, cookies), on_page, lambda: ctx.job_id in _stop_requests
            )
    except Exception as exc:
        raise _wrap_errors(ctx, exc) from exc
    finally:
        _stop_requests.discard(ctx.job_id)
    _listings[url] = (time.monotonic(), listing)
    ctx.progress(100, "instagram.status.probed")
    return {"url": url, "kind": listing["kind"], "uploader": listing["uploader"], "items": items}


def _save(ctx: JobContext, ydl: yt_dlp.YoutubeDL, slide: Dict[str, Any], base: Path, on_bytes: Any) -> Path:
    with ydl.urlopen(Request(slide["url"], headers=REFERER)) as resp:
        default_ext = "mp4" if slide["kind"] == "video" else "jpg"
        ext = mimetype2ext(resp.headers.get("Content-Type")) or default_ext
        path = unique_path(base.with_name(f"{base.name}.{ext}"))
        total = int(resp.headers.get("Content-Length") or 0)
        part = path.with_name(path.name + ".part")
        done = 0
        try:
            with part.open("wb") as fh:
                while chunk := resp.read(CHUNK):
                    ctx.check_cancelled()
                    fh.write(chunk)
                    done += len(chunk)
                    on_bytes(done, total)
            part.replace(path)
        finally:
            part.unlink(missing_ok=True)
    return path


def _save_video(ctx: JobContext, opts: Dict[str, Any], slide: Dict[str, Any], base: Path, on_bytes: Any) -> Path:
    """Best video + audio through yt-dlp, merged to mp4 when Instagram serves them apart."""

    def hook(d: Dict[str, Any]) -> None:
        if ctx.cancelled:
            raise JobCancelled()
        if d.get("status") == "downloading":
            on_bytes(d.get("downloaded_bytes") or 0, d.get("total_bytes") or d.get("total_bytes_estimate") or 0)

    video_opts = {
        **opts,
        "format": AUTO_FORMAT,
        "merge_output_format": "mp4",
        "noprogress": True,
        "outtmpl": f"{base}.%(ext)s",
        "progress_hooks": [hook],
    }
    with UniqueYoutubeDL(video_opts, target_ext="mp4") as ydl:
        info = ydl.process_ie_result(
            {"id": base.name, "title": base.name, "formats": slide["formats"], "http_headers": REFERER},
            download=True,
        )
        return Path(info.get("filepath") or ydl.prepare_filename(info))


def download(
    ctx: JobContext,
    url: str,
    outdir: str,
    indices: Optional[List[int]] = None,
    cookies: Optional[Dict[str, Optional[str]]] = None,
) -> Dict[str, Any]:
    """Save the chosen items of a link (all of them when ``indices`` is empty).

    A profile goes into a sub-folder named after the account. When several items are saved, a
    failed one is logged and skipped; Instagram's rate limit stops the whole job.
    """
    t0 = time.monotonic()
    url = url.strip()
    ctx.progress(None, "instagram.status.probing")
    files: List[str] = []
    file_items: List[int] = []
    failed = 0
    size = 0
    try:
        opts = _opts(url, cookies or {})
        with yt_dlp.YoutubeDL(opts) as ydl:
            cached = _listings.get(url)
            if cached and time.monotonic() - cached[0] < LISTING_TTL_S:
                listing = cached[1]
            else:
                listing = _list(ydl, url, cookie_file_for(url, cookies or {}), lambda entries: ctx.check_cancelled())
            entries = listing["entries"]
            out = Path(outdir).expanduser()
            if listing["subdir"]:
                out = out / sanitize_filename(listing["subdir"])
            out.mkdir(parents=True, exist_ok=True)
            chosen = sorted({i for i in (indices or range(len(entries))) if 0 <= i < len(entries)})
            started = time.monotonic()
            for position, index in enumerate(chosen):
                ctx.check_cancelled()
                entry = entries[index]
                slides = entry["slides"]
                params = {"current": position + 1, "count": len(chosen)}
                try:
                    for number, slide in enumerate(slides, 1):

                        def on_bytes(done: int, total: int, number: int = number) -> None:
                            fraction = (number - 1 + (done / total if total else 0)) / len(slides)
                            received = size + done
                            elapsed = time.monotonic() - started
                            ctx.progress(
                                (position + fraction) * 100 / len(chosen),
                                "instagram.status.downloading",
                                params,
                                downloaded=received,
                                speed=received / elapsed if received and elapsed > 0 else None,
                            )

                        on_bytes(0, 0)
                        base = out / (entry["stem"] if len(slides) == 1 else f"{entry['stem']}_{number}")
                        if slide.get("formats"):
                            path = _save_video(ctx, opts, slide, base, on_bytes)
                        else:
                            path = _save(ctx, ydl, slide, base, on_bytes)
                        files.append(str(path))
                        file_items.append(index)
                        size += path.stat().st_size
                except JobCancelled:
                    raise
                except Exception as exc:
                    error = clean_error_message(str(exc))
                    if len(chosen) == 1 or "HTTP Error 429" in error:
                        raise
                    failed += 1
                    ctx.log("instagram.log.itemFailed", "error", name=entry["stem"], error=error)
    except Exception as exc:
        raise _wrap_errors(ctx, exc) from exc
    ctx.progress(100, "instagram.status.done")
    return {
        "files": files,
        "indices": file_items,
        "failed": failed,
        "size": size,
        "duration": round(time.monotonic() - t0, 1),
        "outdir": str(out),
    }

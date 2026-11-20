"""``mediastudio://`` links, which the browser bookmark hands to the app through Windows.

The installer registers the scheme with ``"MediaStudio.exe" "%1"``, so the link arrives as the
first argument. Any web page can start such a link, so only one exact form is accepted:
``mediastudio://open?url=<encoded http(s) address>``. Everything else is logged and dropped.
"""

import logging
from typing import Optional, Sequence
from urllib.parse import parse_qs, urlsplit

logger = logging.getLogger(__name__)

SCHEME = "mediastudio"
MAX_URL = 2048
MAX_LINK = MAX_URL * 3 + 64  # room for the percent-encoded address


def link_from_argv(argv: Sequence[str]) -> Optional[str]:
    """The raw ``mediastudio:`` argument when the app was started by one, else None."""
    if len(argv) < 2 or not isinstance(argv[1], str):
        return None
    return argv[1] if argv[1].lower().startswith(f"{SCHEME}:") else None


def _safe_url(url: str) -> bool:
    if not url or len(url) > MAX_URL or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in url):
        return False
    try:
        parts = urlsplit(url)
        host = parts.hostname
    except ValueError:
        return False
    return parts.scheme.lower() in ("http", "https") and bool(host)


def parse_link(uri: str) -> Optional[str]:
    """The web address carried by ``mediastudio://open?url=…``, or None for anything else."""
    url = _parse(uri)
    if url is None:
        logger.warning("Ignored app link: %.200r", uri)
    return url


def _parse(uri: str) -> Optional[str]:
    if not isinstance(uri, str) or len(uri) > MAX_LINK:
        return None
    try:
        parts = urlsplit(uri.strip())
    except ValueError:
        return None
    if parts.scheme.lower() != SCHEME or parts.netloc.lower() != "open" or parts.path not in ("", "/"):
        return None
    values = parse_qs(parts.query, keep_blank_values=True).get("url")
    if not values or len(values) != 1:
        return None
    return values[0] if _safe_url(values[0]) else None

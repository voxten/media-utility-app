"""Reads the Windows clipboard and finds a link the download tools understand."""

import ctypes
import re
import sys
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

CF_UNICODETEXT = 13
OPEN_ATTEMPTS, OPEN_RETRY_S = 5, 0.05  # another app may hold the clipboard for a moment
MAX_SCAN_CHARS = 10_000

URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
TARGETS = {
    "download": ("youtube.com", "youtu.be", "tiktok.com", "x.com", "twitter.com"),
    "instagram": ("instagram.com",),
}


def read_text() -> str:
    """Clipboard text, or "" when it holds none or cannot be opened."""
    if sys.platform != "win32":
        return ""
    # Private WinDLL instances, so the signatures set here do not leak into other ctypes users.
    user32 = ctypes.WinDLL("user32")
    kernel32 = ctypes.WinDLL("kernel32")
    user32.OpenClipboard.argtypes = [ctypes.c_void_p]
    user32.GetClipboardData.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]

    for _ in range(OPEN_ATTEMPTS):
        if user32.OpenClipboard(None):
            break
        time.sleep(OPEN_RETRY_S)
    else:
        return ""
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ""
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            return ""
        try:
            return ctypes.wstring_at(pointer)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def _target(host: str) -> Optional[str]:
    host = host.lower()
    for target, domains in TARGETS.items():
        if any(host == d or host.endswith(f".{d}") for d in domains):
            return target
    return None


def find_links(text: str) -> List[Dict[str, str]]:
    """Supported links in ``text``, in order and without repeats, as ``{"url", "target"}``."""
    links: List[Dict[str, str]] = []
    for match in URL_PATTERN.finditer((text or "")[:MAX_SCAN_CHARS]):
        url = match.group(0).rstrip(".,;:!?)]}")
        try:
            host = urlparse(url).hostname or ""
        except ValueError:
            continue
        target = _target(host)
        if target and all(link["url"] != url for link in links):
            links.append({"url": url, "target": target})
    return links


def find_link(text: str) -> Optional[Dict[str, Any]]:
    """The copied link as ``{"url", "target"}``; target is "download" or "instagram".

    Two or more video links go to the download queue together: the first of them, target
    "download", plus all of them in ``urls``. Otherwise the first supported link.
    """
    links = find_links(text)
    videos = [link["url"] for link in links if link["target"] == "download"]
    if len(videos) > 1:
        return {"url": videos[0], "target": "download", "urls": videos}
    return links[0] if links else None

"""Progress-card export.

The card is rendered by the frontend (live preview + ``html-to-image``), which removes the
old Playwright/Chromium dependency. The backend only persists the PNG and loads banners.
"""

from pathlib import Path
from typing import Dict

from backend.core import thumbs

BANNER_MAX = (1600, 600)


def save_png(data_url: str, out_path: str) -> Dict[str, object]:
    target = Path(out_path)
    if target.suffix.lower() != ".png":
        target = target.with_suffix(".png")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(thumbs.decode_data_url(data_url))
    return {"outPath": str(target), "bytes": target.stat().st_size}


def load_banner(path: str) -> str:
    """Banner image as a data URL (downscaled) so the WebView can embed it in the export."""
    return thumbs.to_data_url(Path(path).read_bytes(), BANNER_MAX, fmt="PNG")

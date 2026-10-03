"""Media Studio entry point: native window (pywebview / WebView2) hosting the React UI.

    python main.py          # production: serves frontend/dist
    python main.py --dev    # development: loads the Vite dev server (npm run dev) with HMR + DevTools
"""

import argparse
import sys

import webview
from webview.dom import DOMEventHandler

from backend import APP_NAME
from backend.bridge.api import Api
from backend.bridge.events import EventBus
from backend.core import win_theme
from backend.core.paths import app_data_dir, resource_path
from backend.core.settings import Settings

DEV_URL = "http://localhost:5173"
BACKGROUND = {"dark": "#1f1f1f", "light": "#fafafa"}

MISSING_BUILD_HTML = """
<body style="font-family:Segoe UI,sans-serif;background:#1f1f1f;color:#fff;padding:40px">
<h2>Frontend build not found</h2>
<p>Run <code>npm install &amp;&amp; npm run build</code> in <code>frontend/</code>,
or start with <code>python main.py --dev</code> while <code>npm run dev</code> is running.</p>
</body>
"""


def system_prefers_dark() -> bool:
    if sys.platform != "win32":
        return False
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
        )
        value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
        return value == 0
    except OSError:
        return False


def resolve_dark(theme: str) -> bool:
    return system_prefers_dark() if theme == "system" else theme == "dark"


def main() -> None:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--dev", action="store_true", help="load the Vite dev server")
    parser.add_argument("--url", default=DEV_URL, help="dev server URL (with --dev)")
    args = parser.parse_args()

    settings = Settings()
    bus = EventBus()
    api = Api(bus, settings)
    dark = resolve_dark(settings.get("theme", "system"))
    # Mica needs a transparent window, which can only be chosen at creation time.
    use_mica = bool(settings.get("mica", True)) and win_theme.mica_supported()

    window_kwargs = {}
    if args.dev:
        window_kwargs["url"] = args.url
    else:
        index = resource_path("frontend", "dist", "index.html")
        if index.is_file():
            window_kwargs["url"] = str(index)
        else:
            window_kwargs["html"] = MISSING_BUILD_HTML

    window = webview.create_window(
        APP_NAME,
        js_api=api,
        width=1280,
        height=820,
        min_size=(960, 640),
        background_color=BACKGROUND["dark" if dark else "light"],
        transparent=use_mica,
        **window_kwargs,
    )
    api._attach_window(window)
    api._set_mica(use_mica)  # optimistic, so the UI boots transparent; corrected below if DWM refuses

    def on_drop(event: dict) -> None:
        files = (event.get("dataTransfer") or {}).get("files") or []
        paths = [f["pywebviewFullPath"] for f in files if f.get("pywebviewFullPath")]
        if paths:
            bus.emit("files:dropped", {"paths": paths})

    def on_loaded() -> None:
        win_theme.set_dark_title_bar(window, resolve_dark(settings.get("theme", "system")))
        icon = resource_path("assets", "app.ico")
        if icon.is_file():
            win_theme.set_window_icon(window, str(icon))
        if use_mica:
            active = win_theme.enable_mica(window)
            api._set_mica(active)
            bus.emit("app:mica", {"active": active})
        # Native drop gives full file paths, which the browser drop event cannot.
        window.dom.document.events.drop += DOMEventHandler(on_drop, prevent_default=True)

    window.events.loaded += on_loaded
    window.events.closing += api._detach_window
    window.events.closed += api._shutdown

    webview.start(
        debug=args.dev,
        http_server=not args.dev,
        private_mode=False,
        storage_path=str(app_data_dir() / "webview"),
    )


if __name__ == "__main__":
    main()

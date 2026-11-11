"""Media Studio entry point: native window (pywebview / WebView2) hosting the React UI.

    python main.py          # production: serves frontend/dist
    python main.py --dev    # development: loads the Vite dev server (npm run dev) with HMR + DevTools
    MediaStudio.exe --selftest report.json   # bundle smoke test (used by scripts/build.py)
    MediaStudio.exe --pip install …          # pip inside the bundle, used to install optional AI packages
    MediaStudio.exe --check-engines ID DIR REPORT  # imports a freshly installed yt-dlp/gallery-dl before it is used
"""

import argparse
import os
import shutil
import sys

import webview
from webview.dom import DOMEventHandler

from backend import APP_NAME, APP_VERSION
from backend.bridge.events import EventBus
from backend.core import single_instance, win_theme
from backend.core.addons import PIP_FLAG, activate_addons, run_pip_main
from backend.core.engines import CHECK_FLAG, activate_engines, run_check_main
from backend.core.paths import app_data_dir, resource_path
from backend.core.settings import Settings

DEV_URL = "http://localhost:5173"
BACKGROUND = {"dark": "#1f1f1f", "light": "#fafafa"}


def cleanup_webview_cache() -> None:
    """Ensure WebView2 does not serve stale assets from disk cache when the app updates."""
    # Instruct Chromium/WebView2 not to cache HTTP responses from the local pywebview server
    flags = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "")
    if "--disable-http-cache" not in flags:
        os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = f"{flags} --disable-http-cache".strip()

    webview_dir = app_data_dir() / "webview"
    # Always clear the HTTP and code caches on launch so fresh code is loaded immediately
    cache_dirs = [
        webview_dir / "EBWebView" / "Default" / "Cache",
        webview_dir / "EBWebView" / "Default" / "Code Cache",
        webview_dir / "EBWebView" / "Default" / "GPUCache",
        webview_dir / "EBWebView" / "ShaderCache",
    ]
    for d in cache_dirs:
        if d.is_dir():
            shutil.rmtree(d, ignore_errors=True)

    try:
        webview_dir.mkdir(parents=True, exist_ok=True)
        (webview_dir / "app_version.txt").write_text(APP_VERSION, encoding="utf-8")
    except Exception:
        pass


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


def ensure_output_streams() -> None:
    """A --windowed PyInstaller build has no stdout/stderr (None); send them to a log file.

    Without this, any print() or traceback.print_exc() in a worker raises and the job would
    never report its error to the UI.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return
    log_dir = app_data_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log = open(log_dir / "app.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115 - lives for the process
    sys.stdout = sys.stdout or log
    sys.stderr = sys.stderr or log


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == PIP_FLAG:
        sys.exit(run_pip_main(sys.argv[2:]))
    if len(sys.argv) > 1 and sys.argv[1] == CHECK_FLAG:
        sys.exit(run_check_main(sys.argv[2:]))
    ensure_output_streams()
    activate_addons()
    activate_engines()
    # Imported only now: it pulls in yt_dlp and gallery_dl, which must come from the activated engines.
    from backend.bridge.api import Api

    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--dev", action="store_true", help="load the Vite dev server")
    parser.add_argument("--url", default=DEV_URL, help="dev server URL (with --dev)")
    parser.add_argument("--selftest", metavar="REPORT", help="run the bundle smoke test, write JSON and exit")
    args = parser.parse_args()

    if args.selftest:
        from backend import selftest

        sys.exit(0 if selftest.run(args.selftest) else 1)

    # A second launch only brings the running (possibly hidden) window back.
    channel = "dev" if args.dev else "app"
    if single_instance.notify_running(channel):
        return
    instance = single_instance.listen(channel)
    cleanup_webview_cache()  # only once we know no other instance is using the cache

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
    window.events.closing += api._on_closing
    window.events.closed += api._shutdown
    if instance is not None:
        instance.serve(api._show_window)

    webview.start(
        debug=args.dev,
        http_server=not args.dev,
        private_mode=False,
        storage_path=str(app_data_dir() / "webview"),
    )
    if instance is not None:
        instance.close()
    if api._restart_requested():
        restart_app()


def restart_app() -> None:
    """Start a fresh copy once this one has let go of the single-instance pipe."""
    import subprocess

    args = sys.argv[1:] if getattr(sys, "frozen", False) else [os.path.abspath(sys.argv[0]), *sys.argv[1:]]
    subprocess.Popen([sys.executable, *args], close_fds=True)


if __name__ == "__main__":
    main()

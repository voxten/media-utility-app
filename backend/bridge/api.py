"""The object exposed to JavaScript as ``window.pywebview.api``.

Every public attribute of :class:`Api` is a namespace (``api.converter.start(...)``).
Methods only validate/delegate: long work goes through the JobManager and returns a
job id immediately; results arrive as ``job:*`` events. Internal state lives in
underscore attributes so pywebview does not expose it.
"""

import base64
import mimetypes
import platform
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend import APP_NAME, APP_VERSION
from backend.bridge.events import EventBus
from backend.core import deps, system, win_theme
from backend.core.jobs import JobManager
from backend.core.settings import Settings
from backend.services import converter, download, duplicates, pdf, progress_image, tts, watermark


class _Context:
    """Shared services handed to every namespace."""

    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self.jobs = JobManager(bus.emit)
        self.window: Any = None
        self.mica = False  # set by main.py once the backdrop is active


class _Namespace:
    def __init__(self, ctx: _Context) -> None:
        self._ctx = ctx


class AppApi(_Namespace):
    def ready(self) -> Dict[str, Any]:
        """Frontend finished booting; start delivering events."""
        self._ctx.bus.mark_ready()
        return self.info()

    def info(self) -> Dict[str, Any]:
        return {
            "name": APP_NAME,
            "version": APP_VERSION,
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "mica": self._ctx.mica,
            "micaSupported": win_theme.mica_supported(),
        }

    def set_title_bar_theme(self, dark: bool) -> bool:
        return win_theme.set_dark_title_bar(self._ctx.window, bool(dark))


class SettingsApi(_Namespace):
    def get(self) -> Dict[str, Any]:
        return self._ctx.settings.all()

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        return self._ctx.settings.update(patch or {})

    def add_recent_folder(self, folder: str) -> None:
        if folder:
            self._ctx.settings.add_recent_folder(folder)


class DialogsApi(_Namespace):
    """Native file dialogs. ``file_types`` use pywebview syntax: ``"PDF (*.pdf)"``."""

    def _dialog(self, kind: int, **kwargs: Any) -> Optional[List[str]]:
        import webview

        result = self._ctx.window.create_file_dialog(webview.FileDialog(kind), **kwargs)
        return list(result) if result else None

    def open_files(self, file_types: Optional[List[str]] = None, multiple: bool = True, directory: str = "") -> List[str]:
        return self._dialog(10, allow_multiple=bool(multiple), file_types=tuple(file_types or ()), directory=directory or "") or []

    def open_folder(self, directory: str = "") -> Optional[str]:
        result = self._dialog(20, directory=directory or "")
        return result[0] if result else None

    def save_file(self, filename: str = "", file_types: Optional[List[str]] = None, directory: str = "") -> Optional[str]:
        result = self._dialog(30, save_filename=filename or "", file_types=tuple(file_types or ()), directory=directory or "")
        if not result:
            return None
        return result if isinstance(result, str) else result[0]


class SystemApi(_Namespace):
    def open_path(self, path: str) -> None:
        system.open_path(path)

    def reveal(self, path: str) -> None:
        system.reveal_in_folder(path)

    def trash(self, path: str) -> None:
        system.move_to_trash(path)

    def dependencies(self) -> List[Dict[str, Any]]:
        return deps.check_dependencies()

    def path_info(self, path: str) -> Dict[str, Any]:
        p = Path(path)
        return {"exists": p.exists(), "isDir": p.is_dir(), "isFile": p.is_file(), "name": p.name, "parent": str(p.parent)}


class JobsApi(_Namespace):
    def list(self) -> List[Dict[str, Any]]:
        return self._ctx.jobs.list()

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._ctx.jobs.get(job_id)

    def cancel(self, job_id: str) -> bool:
        return self._ctx.jobs.cancel(job_id)


class ConverterApi(_Namespace):
    def formats(self) -> List[str]:
        return list(converter.SUPPORTED_FORMATS)

    def count_files(self, input_dir: str, in_format: str) -> int:
        if not input_dir or not Path(input_dir).is_dir():
            return 0
        return len(converter.find_source_files(input_dir, in_format))

    def start(self, options: Dict[str, Any]) -> str:
        opts = converter.ConvertOptions.from_dict(options)
        return self._ctx.jobs.submit("converter", lambda ctx: converter.convert(ctx, opts), title=opts.out_fmt.upper())


class PdfApi(_Namespace):
    def inspect(self, paths: List[str]) -> str:
        files = [p for p in paths if p.lower().endswith(".pdf")]
        return self._ctx.jobs.submit("pdf.inspect", lambda ctx: pdf.inspect(ctx, files))

    def render_page(self, path: str, page: int) -> str:
        return pdf.render_page(path, int(page))

    def merge(self, pages: List[Dict[str, Any]], out_path: str) -> str:
        return self._ctx.jobs.submit("pdf.merge", lambda ctx: pdf.merge(ctx, pages, out_path), title=Path(out_path).name)


class DuplicatesApi(_Namespace):
    def scan(self, folder: str, mode: str, threshold: float = duplicates.HASH_THRESHOLD) -> str:
        if not Path(folder).is_dir():
            raise ValueError(f"Not a folder: {folder}")
        self._ctx.settings.add_recent_folder(folder)
        return self._ctx.jobs.submit(
            f"duplicates.{mode}", lambda ctx: duplicates.scan(ctx, folder, mode, float(threshold)), title=Path(folder).name
        )

    def export_csv(self, groups: List[List[Dict[str, Any]]], out_path: str) -> str:
        return duplicates.export_csv(groups, out_path)


class TtsApi(_Namespace):
    def voices(self, engine: str) -> List[Dict[str, Any]]:
        return tts.list_voices(engine)

    def synthesize(self, params: Dict[str, Any]) -> str:
        return self._ctx.jobs.submit(
            "tts",
            lambda ctx: tts.synthesize(
                ctx, params["text"], params["engine"], params.get("voice", ""), params.get("rate", 0), params["outPath"]
            ),
            title=Path(params["outPath"]).name,
        )

    def audio_data_url(self, path: str) -> str:
        """Generated audio for the in-app player (the WebView cannot read arbitrary local files)."""
        mime = mimetypes.guess_type(path)[0] or "audio/mpeg"
        return f"data:{mime};base64,{base64.b64encode(Path(path).read_bytes()).decode('ascii')}"


class DownloadApi(_Namespace):
    def probe(self, url: str) -> str:
        cookies = self._ctx.settings.cookie_files()
        return self._ctx.jobs.submit("download.probe", lambda ctx: download.probe(ctx, url, cookies), title=url)

    def start(self, params: Dict[str, Any]) -> str:
        cookies = self._ctx.settings.cookie_files()
        return self._ctx.jobs.submit(
            "download",
            lambda ctx: download.download(
                ctx,
                params["url"],
                params["formatId"],
                params["outdir"],
                params.get("template") or download.DEFAULT_TEMPLATE,
                params.get("mode", "video"),
                params.get("audioCodec", "mp3"),
                cookies,
            ),
            title=params.get("title") or params["url"],
        )

    def batch(self, params: Dict[str, Any]) -> str:
        cookies = self._ctx.settings.cookie_files()
        urls = [u for u in params["urls"] if u.strip()]
        return self._ctx.jobs.submit(
            "download.batch",
            lambda ctx: download.download_batch(
                ctx, urls, params["outdir"], params.get("template") or download.DEFAULT_TEMPLATE, cookies
            ),
            title=f"{len(urls)} URL",
        )


class WatermarkApi(_Namespace):
    def load(self, path: str) -> Dict[str, Any]:
        return watermark.load_preview(path)

    def lama_available(self) -> bool:
        return watermark.lama_available()

    def remove(self, path: str, mask_png: str, method: str = "telea") -> str:
        return self._ctx.jobs.submit(
            "watermark", lambda ctx: watermark.remove(ctx, path, mask_png, method), title=Path(path).name
        )

    def save(self, result_path: str, out_path: str) -> str:
        return watermark.save_result(result_path, out_path)


class ProgressApi(_Namespace):
    def load_banner(self, path: str) -> str:
        return progress_image.load_banner(path)

    def save(self, data_url: str, out_path: str) -> Dict[str, Any]:
        return progress_image.save_png(data_url, out_path)


class Api:
    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self._ctx = _Context(bus, settings)
        self.app = AppApi(self._ctx)
        self.settings = SettingsApi(self._ctx)
        self.dialogs = DialogsApi(self._ctx)
        self.system = SystemApi(self._ctx)
        self.jobs = JobsApi(self._ctx)
        self.converter = ConverterApi(self._ctx)
        self.pdf = PdfApi(self._ctx)
        self.duplicates = DuplicatesApi(self._ctx)
        self.tts = TtsApi(self._ctx)
        self.download = DownloadApi(self._ctx)
        self.watermark = WatermarkApi(self._ctx)
        self.progress = ProgressApi(self._ctx)

    def _attach_window(self, window: Any) -> None:
        self._ctx.window = window
        self._ctx.bus.attach(window)

    def _set_mica(self, active: bool) -> None:
        self._ctx.mica = active

    def _detach_window(self) -> None:
        self._ctx.bus.detach()

    def _shutdown(self) -> None:
        self._ctx.bus.detach()
        self._ctx.jobs.shutdown()
        self._ctx.bus.close()

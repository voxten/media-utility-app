"""The object exposed to JavaScript as ``window.pywebview.api``.

Every public attribute of :class:`Api` is a namespace (``api.converter.start(...)``).
Methods only validate/delegate: long work goes through the JobManager and returns a
job id immediately; results arrive as ``job:*`` events. Internal state lives in
underscore attributes so pywebview does not expose it.
"""

import base64
import logging
import mimetypes
import platform
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

from backend import APP_NAME, APP_VERSION
from backend.bridge.events import EventBus
from backend.core import deps, paths, system, win_theme
from backend.core.jobs import JobManager
from backend.core.settings import Settings
from backend.services import (
    compressor,
    converter,
    deps_installer,
    download,
    duplicates,
    image_editor,
    pdf,
    progress_image,
    rembg_service,
    system_info,
    tts,
    upscale,
    video_sync,
    watermark,
)


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

    def clear_recent_folders(self) -> Dict[str, Any]:
        return self._ctx.settings.clear_recent_folders()

    def reset(self) -> Dict[str, Any]:
        return self._ctx.settings.reset()


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
        try:
            system.open_path(path)
        except Exception as e:
            logger.warning("Could not open path %s: %s", path, e)

    def reveal(self, path: str) -> None:
        try:
            system.reveal_in_folder(path)
        except Exception as e:
            logger.warning("Could not reveal path %s: %s", path, e)

    def trash(self, path: str) -> None:
        try:
            system.move_to_trash(path)
        except Exception as e:
            logger.warning("Could not move to trash %s: %s", path, e)

    def dependencies(self) -> List[Dict[str, Any]]:
        custom_ffmpeg = self._ctx.settings.get("customFfmpegPath")
        return deps.check_dependencies(custom_ffmpeg=custom_ffmpeg)

    def storage_info(self) -> Dict[str, Any]:
        return system_info.get_storage_info()

    def clear_cache(self) -> Dict[str, Any]:
        return system_info.clear_cache()

    def hardware_info(self) -> Dict[str, Any]:
        return system_info.get_hardware_info()

    def open_app_data(self) -> None:
        try:
            system.open_path(str(paths.app_data_dir()))
        except Exception as e:
            logger.warning("Could not open app data directory: %s", e)

    def install_dependency(self, dep_id: str) -> str:
        if dep_id.startswith("upscale"):
            tool_prefix = "upscale"
        elif dep_id == "lama":
            tool_prefix = "watermark"
        elif dep_id == "rembg":
            tool_prefix = "rembg"
        else:
            tool_prefix = "download"
        return self._ctx.jobs.submit(
            f"{tool_prefix}.install",
            lambda ctx: deps_installer.install_dependency(ctx, dep_id),
            title=f"deps.installTitle.{dep_id}",
        )

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

    def compress(self, path: str, out_path: str, quality: str = "balanced") -> str:
        return self._ctx.jobs.submit(
            "pdf.compress",
            lambda ctx: pdf.compress(ctx, path, out_path, quality_preset=quality),
            title=Path(path).name,
        )

    def split(self, path: str, out_dir: str, mode: str = "all", range_spec: str = "") -> str:
        return self._ctx.jobs.submit(
            "pdf.split",
            lambda ctx: pdf.split(ctx, path, out_dir, mode=mode, range_spec=range_spec),
            title=Path(path).name,
        )

    def pdf_to_images(self, path: str, out_dir: str, fmt: str = "png", dpi: int = 150) -> str:
        return self._ctx.jobs.submit(
            "pdf.to_images",
            lambda ctx: pdf.pdf_to_images(ctx, path, out_dir, fmt=fmt, dpi=int(dpi)),
            title=Path(path).name,
        )

    def images_to_pdf(self, paths: List[str], out_path: str) -> str:
        return self._ctx.jobs.submit(
            "pdf.from_images",
            lambda ctx: pdf.images_to_pdf(ctx, paths, out_path),
            title=Path(out_path).name,
        )

    def rotate_pages(self, path: str, pages: List[int], angle: int, out_path: str) -> str:
        return self._ctx.jobs.submit(
            "pdf.rotate",
            lambda ctx: pdf.rotate_pages(ctx, path, pages, angle, out_path),
            title=Path(path).name,
        )

    def extract_text(self, path: str, out_path: str) -> str:
        return self._ctx.jobs.submit(
            "pdf.extract_text",
            lambda ctx: pdf.extract_text(ctx, path, out_path),
            title=Path(path).name,
        )


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
        p = Path(path)
        if not p.is_file():
            return ""
        mime = mimetypes.guess_type(path)[0] or "audio/mpeg"
        try:
            return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode('ascii')}"
        except Exception:
            return ""


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


class UpscaleApi(_Namespace):
    def load(self, path: str) -> Dict[str, Any]:
        return upscale.load_preview(path)

    def models_status(self) -> Dict[str, bool]:
        return {
            "general": upscale.is_model_available("general"),
            "anime": upscale.is_model_available("anime"),
        }

    def start(self, params: Dict[str, Any]) -> str:
        path = params["path"]
        model = params.get("model", "general")
        scale = int(params.get("scale", 4))
        alpha_mode = params.get("alphaMode", "smooth")
        anti_halo = bool(params.get("antiHalo", True))

        return self._ctx.jobs.submit(
            "upscale",
            lambda ctx: upscale.upscale(
                ctx,
                image_path=path,
                model_id=model,
                scale=scale,
                alpha_mode=alpha_mode,
                anti_halo=anti_halo,
            ),
            title=f"{Path(path).name} ({scale}x)",
        )

    def save(self, result_path: str, out_path: str) -> str:
        return upscale.save_result(result_path, out_path)


class RemBgApi(_Namespace):
    def load(self, path: str) -> Dict[str, Any]:
        return rembg_service.load_preview(path)

    def is_available(self) -> bool:
        return rembg_service.is_available()

    def remove(self, params: Dict[str, Any]) -> str:
        path = params["path"]
        return self._ctx.jobs.submit(
            "rembg",
            lambda ctx: rembg_service.remove(ctx, params),
            title=Path(path).name,
        )

    def save(self, result_path: str, out_path: str) -> str:
        return rembg_service.save_result(result_path, out_path)


class CompressorApi(_Namespace):
    def load_preview(self, path: str) -> Dict[str, Any]:
        return compressor.load_preview(path)

    def preview(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        return compressor.preview_compress(path, params)

    def start(self, params: Dict[str, Any]) -> str:
        files = params.get("files") or ([params["path"]] if params.get("path") else [])
        title = Path(files[0]).name if len(files) == 1 else f"{len(files)} files"
        return self._ctx.jobs.submit(
            "compressor",
            lambda ctx: compressor.compress(ctx, params),
            title=title,
        )


class ImageEditorApi(_Namespace):
    def load_preview(self, path: str) -> Dict[str, Any]:
        return image_editor.load_preview(path)

    def preview_transform(self, path: str, operations: Dict[str, Any]) -> Dict[str, Any]:
        return image_editor.preview_transform(path, operations)

    def save_transformed(
        self,
        src_path: str,
        target_path: str,
        operations: Dict[str, Any],
        out_fmt: Optional[str] = None,
        quality: int = 90,
    ) -> Dict[str, Any]:
        return image_editor.save_transformed(src_path, target_path, operations, out_fmt=out_fmt, quality=quality)

    def start_batch(
        self,
        files: List[str],
        output_dir: str,
        operations: Dict[str, Any],
        out_fmt: Optional[str] = None,
        quality: int = 90,
    ) -> str:
        title = f"{len(files)} files"
        return self._ctx.jobs.submit(
            "image_editor",
            lambda ctx: image_editor.batch_process(
                ctx, files, output_dir, operations, out_fmt=out_fmt, quality=quality
            ),
            title=title,
        )


class VideoSyncApi(_Namespace):
    def probe(self, path: str) -> Dict[str, Any]:
        return video_sync.probe_media(path)

    def waveform(
        self,
        path: str,
        points: int = 1200,
        start_sec: float = 0.0,
        duration: Optional[float] = None,
        stream_idx: Optional[int] = None,
    ) -> Dict[str, Any]:
        return video_sync.extract_waveform(
            path,
            stream_index=stream_idx,
            points=int(points),
            start_sec=float(start_sec),
            duration=float(duration) if duration is not None else None,
        )

    def preview(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return video_sync.generate_preview(
            video_path=params["videoPath"],
            offset_sec=float(params.get("offsetSec", 0.0)),
            start_sec=float(params.get("startSec", 0.0)),
            duration=float(params.get("duration", 30.0)),
            audio_path=params.get("audioPath"),
            audio_stream_idx=int(params.get("audioTrackIndex", 0)),
        )

    def start(self, params: Dict[str, Any]) -> str:
        v_path = params["videoPath"]
        title = Path(v_path).name
        return self._ctx.jobs.submit(
            "video_sync",
            lambda ctx: video_sync.sync_video(ctx, params),
            title=title,
        )


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
        self.upscale = UpscaleApi(self._ctx)
        self.rembg = RemBgApi(self._ctx)
        self.compressor = CompressorApi(self._ctx)
        self.image_editor = ImageEditorApi(self._ctx)
        self.video_sync = VideoSyncApi(self._ctx)

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

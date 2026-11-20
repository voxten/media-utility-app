"""The object exposed to JavaScript as ``window.pywebview.api``.

Every public attribute of :class:`Api` is a namespace (``api.converter.start(...)``).
Methods only validate/delegate: long work goes through the JobManager and returns a
job id immediately; results arrive as ``job:*`` events. Internal state lives in
underscore attributes so pywebview does not expose it.
"""

import logging
import platform
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)
frontend_logger = logging.getLogger("backend.frontend")
# How long quitting waits for cancelled jobs to stop before main.py ends the process anyway.
SHUTDOWN_WAIT_S = 3.0

from backend import APP_NAME, APP_VERSION
from backend.core.errors import AppError
from backend.bridge.events import EventBus
from backend.core import clipboard, deps, engines, ffmpeg, logs, media_server, paths, system, win_theme
from backend.core.app_shell import AppShell
from backend.core.history import JobHistory
from backend.core.hotkey import GlobalHotkey
from backend.core.jobs import JobManager
from backend.core.settings import Settings, validate_patch
from backend.core.taskbar import TaskbarProgress
from backend.core.lazy import lazy_import

# Loaded on first use, so the window opens before cv2, yt-dlp and PyMuPDF are imported.
compressor = lazy_import("backend.services.compressor")
converter = lazy_import("backend.services.converter")
deps_installer = lazy_import("backend.services.deps_installer")
download = lazy_import("backend.services.download")
download_queue = lazy_import("backend.services.download_queue")
duplicates = lazy_import("backend.services.duplicates")
gif_editor = lazy_import("backend.services.gif_editor")
gif_render = lazy_import("backend.services.gif_render")
image_editor = lazy_import("backend.services.image_editor")
instagram = lazy_import("backend.services.instagram")
pdf = lazy_import("backend.services.pdf")
progress_image = lazy_import("backend.services.progress_image")
rembg_service = lazy_import("backend.services.rembg_service")
system_info = lazy_import("backend.services.system_info")
transcribe = lazy_import("backend.services.transcribe")
tts = lazy_import("backend.services.tts")
upscale = lazy_import("backend.services.upscale")
video_sync = lazy_import("backend.services.video_sync")
video_to_gif = lazy_import("backend.services.video_to_gif")
media_convert = lazy_import("backend.services.media_convert")
watermark = lazy_import("backend.services.watermark")


class _Context:
    """Shared services handed to every namespace."""

    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self.history = JobHistory(temp_dir=paths.cache_dir())
        self.jobs = JobManager(bus.emit, max_workers=settings.get("maxConcurrency", 4), history=self.history)
        self.shell = AppShell(APP_NAME, settings, self.jobs.active_count, bus.emit)
        self.hotkey = GlobalHotkey(self.shell.download_clipboard_link)
        self.hotkey_taken = False  # the saved shortcut could not be registered at start-up
        self.window: Any = None
        self.taskbar = TaskbarProgress(lambda: win_theme.window_handle(self.window) if self.window else None)
        self.mica = False  # set by main.py once the backdrop is active
        self.started = False

    def apply_saved_hotkey(self) -> None:
        try:
            self.hotkey.set(self.settings.get("globalHotkey", ""))
        except (AppError, ValueError):
            self.hotkey_taken = True


class _Namespace:
    def __init__(self, ctx: _Context) -> None:
        self._ctx = ctx


class AppApi(_Namespace):
    def ready(self) -> Dict[str, Any]:
        """Frontend finished booting; start delivering events."""
        self._ctx.bus.mark_ready()
        if not self._ctx.started:
            self._ctx.started = True
            self._ctx.apply_saved_hotkey()
            threading.Thread(target=self._check_engines, name="engine-check", daemon=True).start()
        return {**self.info(), "hotkeyTaken": self._ctx.hotkey_taken}

    def _check_engines(self) -> None:
        settings = self._ctx.settings
        if not engines.auto_check_due(settings):
            return
        try:
            result = engines.check_updates(settings)
        except Exception as exc:  # noqa: BLE001 - offline start-ups simply try again next time
            logger.info("Download engine update check failed: %s", exc)
            return
        available = [item for item in result if item["updateAvailable"]]
        if available:
            self._ctx.bus.emit("engines:update", {"engines": available})

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

    def notify(self, title: str, body: str = "", force: bool = False) -> bool:
        """System notification; skipped while the window is in front unless ``force``."""
        return self._ctx.shell.notify(str(title or APP_NAME), str(body or ""), bool(force))

    def set_shell_labels(self, labels: Dict[str, str]) -> None:
        """Translated texts for the tray menu and native prompts (the backend has no i18n)."""
        self._ctx.shell.set_labels(labels)

    def set_taskbar_progress(self, state: str, value: float = 0.0) -> None:
        self._ctx.taskbar.set(state, value)

    def report_error(self, source: str, message: str, stack: str = "") -> None:
        """An unexpected error in the window, written to the app log next to the backend's own."""
        frontend_logger.error("[%s] %s\n%s", str(source)[:40], str(message)[:2000], str(stack)[:8000])


class SettingsApi(_Namespace):
    def get(self) -> Dict[str, Any]:
        return self._ctx.settings.all()

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        patch = validate_patch(patch or {})
        if "globalHotkey" in patch:
            self._ctx.hotkey.set(patch["globalHotkey"])  # a shortcut owned by another program is not saved
            self._ctx.hotkey_taken = False
        updated = self._ctx.settings.update(patch)
        self._ctx.jobs.set_limit(updated.get("maxConcurrency"))
        return updated

    def reset(self) -> Dict[str, Any]:
        updated = self._ctx.settings.reset()
        self._ctx.jobs.set_limit(updated.get("maxConcurrency"))
        self._ctx.hotkey.set(updated.get("globalHotkey", ""))
        self._ctx.hotkey_taken = False
        return updated


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


def _file_action(action: Callable[[str], None], path: str, failed_key: str) -> None:
    """Runs an Explorer or Recycle Bin action; a failure reaches the window as a translatable reason."""
    try:
        action(path)
    except FileNotFoundError:
        logger.warning("%s: %s does not exist", action.__name__, path)
        raise RuntimeError("errors.pathMissing") from None
    except Exception as e:
        logger.warning("%s failed for %s: %s", action.__name__, path, e)
        raise RuntimeError(failed_key) from e


class SystemApi(_Namespace):
    def open_path(self, path: str) -> None:
        _file_action(system.open_path, path, "errors.openFailed")

    def reveal(self, path: str) -> None:
        _file_action(system.reveal_in_folder, path, "errors.openFailed")

    def dependencies(self) -> List[Dict[str, Any]]:
        custom_ffmpeg = self._ctx.settings.get("customFfmpegPath")
        return deps.check_dependencies(custom_ffmpeg=custom_ffmpeg)

    def storage_info(self) -> Dict[str, Any]:
        return system_info.get_storage_info()

    def clear_cache(self) -> Dict[str, Any]:
        return system_info.clear_cache()

    def hardware_info(self) -> Dict[str, Any]:
        return system_info.get_hardware_info()

    def open_logs(self) -> None:
        system.open_path(str(logs.logs_dir()))

    def open_app_data(self) -> None:
        try:
            system.open_path(str(paths.app_data_dir()))
        except Exception as e:
            logger.warning("Could not open app data directory: %s", e)

    def install_dependency(self, dep_id: str) -> str:
        title = f"deps.installTitle.{dep_id}"
        # A second click (or the same install from Settings) follows the running download instead of starting another.
        running = next((job for job in self._ctx.jobs.list() if job["status"] == "running" and job["title"] == title), None)
        if running:
            return running["id"]
        if dep_id.startswith("upscale"):
            tool_prefix = "upscale"
        elif dep_id == "lama":
            tool_prefix = "watermark"
        elif dep_id == "rembg":
            tool_prefix = "rembg"
        elif dep_id == "gifsicle":
            tool_prefix = "gif_editor"
        elif dep_id.startswith("whisper_"):
            tool_prefix = "transcribe"
        else:
            tool_prefix = "download"
        return self._ctx.jobs.submit(
            f"{tool_prefix}.install",
            lambda ctx: deps_installer.install_dependency(ctx, dep_id),
            title=title,
        )

    def engines(self) -> List[Dict[str, Any]]:
        return engines.status(self._ctx.settings)

    def check_engines(self) -> List[Dict[str, Any]]:
        return engines.check_updates(self._ctx.settings)

    def update_engines(self) -> str:
        return self._ctx.jobs.submit(
            "download.engines",
            lambda ctx: deps_installer.update_engines(ctx, self._ctx.settings),
            title="engines.updateTitle",
            limited=False,
        )

    def reset_engines(self) -> List[Dict[str, Any]]:
        engines.reset()
        return engines.status(self._ctx.settings)

    def restart(self) -> None:
        self._ctx.shell.restart()

    def clipboard_link(self) -> Optional[Dict[str, Any]]:
        """A copied YouTube/TikTok/X/Instagram link as ``{url, target, urls?}``, or None (see clipboard.find_link)."""
        return clipboard.find_link(clipboard.read_text())

    def path_info(self, path: str) -> Dict[str, Any]:
        p = Path(path)
        return {"exists": p.exists(), "isDir": p.is_dir(), "isFile": p.is_file(), "name": p.name, "parent": str(p.parent)}


class JobsApi(_Namespace):
    def cancel(self, job_id: str) -> bool:
        return self._ctx.jobs.cancel(job_id)

    def retry(self, job_id: str) -> Optional[str]:
        return self._ctx.jobs.retry(job_id)

    def history(self) -> List[Dict[str, Any]]:
        return self._ctx.history.entries()

    def clear_history(self) -> None:
        self._ctx.history.clear()


class ConverterApi(_Namespace):
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
        return self._ctx.jobs.submit(
            "pdf.inspect", lambda ctx: pdf.inspect(ctx, files), retryable=False, limited=False
        )

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

    def split(self, path: str, out_dir: str, mode: str = "all", groups: Optional[List[List[int]]] = None) -> str:
        return self._ctx.jobs.submit(
            "pdf.split",
            lambda ctx: pdf.split(ctx, path, out_dir, mode=mode, groups=groups or []),
            title=Path(path).name,
        )

    def pdf_to_images(self, path: str, out_dir: str, fmt: str = "png", dpi: int = 150, range_spec: str = "") -> str:
        return self._ctx.jobs.submit(
            "pdf.to_images",
            lambda ctx: pdf.pdf_to_images(ctx, path, out_dir, fmt=fmt, dpi=int(dpi), range_spec=range_spec),
            title=Path(path).name,
        )

    def images_to_pdf(self, paths: List[str], out_path: str) -> str:
        return self._ctx.jobs.submit(
            "pdf.from_images",
            lambda ctx: pdf.images_to_pdf(ctx, paths, out_path),
            title=Path(out_path).name,
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
            raise AppError("errors.notFolder", folder=folder)
        return self._ctx.jobs.submit(
            f"duplicates.{mode}", lambda ctx: duplicates.scan(ctx, folder, mode, float(threshold)), title=Path(folder).name
        )

    def export_csv(self, groups: List[List[Dict[str, Any]]], out_path: str) -> str:
        return duplicates.export_csv(groups, out_path)

    def trash(self, paths: List[str]) -> str:
        title = Path(paths[0]).parent.name if paths else ""
        return self._ctx.jobs.submit(
            "duplicates.trash", lambda ctx: duplicates.trash(ctx, paths), title=title, retryable=False
        )


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

    def read_text(self, path: str) -> str:
        return tts.read_text_file(path)

    def audio_url(self, path: str) -> str:
        """Generated audio for the in-app player (the WebView cannot read arbitrary local files)."""
        return media_server.file_url(path) if Path(path).is_file() else ""


class DownloadApi(_Namespace):
    def probe(self, url: str) -> str:
        cookies = self._ctx.settings.cookie_files()
        return self._ctx.jobs.submit(
            "download.probe", lambda ctx: download.probe(ctx, url, cookies), title=url, retryable=False, limited=False
        )

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
                params.get("subtitles"),
                bool(self._ctx.settings.get("downloadEmbedMeta")),
                str(download.archive_path()),
                bool(params.get("sponsorblock")),
                params.get("section"),
            ),
            title=params.get("title") or params["url"],
        )

    def _submit_batch(self, urls: List[str], params: Dict[str, Any], replaces: Optional[str]) -> str:
        """``replaces`` is the saved unfinished queue this one resumes or replaces."""
        cookies = self._ctx.settings.cookie_files()
        settings = self._ctx.settings
        max_height = params.get("maxHeight") or 0
        return self._ctx.jobs.submit(
            "download.batch",
            lambda ctx: download_queue.download_batch(
                ctx,
                urls,
                params["outdir"],
                params.get("template") or download.DEFAULT_TEMPLATE,
                cookies,
                params.get("subtitles"),
                mode=params.get("mode") or "video",
                audio_codec=params.get("audioCodec") or "mp3",
                max_height=max_height if isinstance(max_height, int) else 0,
                embed_meta=bool(settings.get("downloadEmbedMeta")),
                skip_archived=bool(settings.get("downloadSkipArchived")),
                archive=str(download.archive_path()),
                persist=True,
                replaces=replaces,
                sponsorblock=bool(params.get("sponsorblock")),
            ),
            title=f'download.batchTitle|{{"count": {len(urls)}}}',
        )

    def batch(self, params: Dict[str, Any]) -> str:
        """A new queue replaces the offered unfinished one (the window asks before starting)."""
        saved = download_queue.pending_queue()
        return self._submit_batch([u for u in params["urls"] if u.strip()], params, saved["key"] if saved else None)

    def pending_queue(self) -> Optional[Dict[str, Any]]:
        """The queue left unfinished by the last run (closed app or cancel), or None."""
        return download_queue.pending_queue()

    def resume_queue(self) -> str:
        """Start the unfinished queue again with the options it was started with."""
        saved = download_queue.pending_queue()
        if not saved:
            raise RuntimeError("download.error.noPendingQueue")
        return self._submit_batch(saved["urls"], saved["options"], saved["key"])

    def discard_queue(self) -> bool:
        download_queue.discard_queue()
        return True

    def archive_count(self) -> int:
        return download.archive_count()

    def clear_archive(self) -> bool:
        download.clear_archive()
        return True

    def add_to_batch(self, params: Dict[str, Any]) -> Dict[str, Any]:
        urls = [u for u in params.get("urls", []) if u.strip()]
        job_id = params.get("jobId")
        success = download_queue.add_to_batch(job_id, urls)
        return {"success": success}


class InstagramApi(_Namespace):
    def probe(self, url: str) -> str:
        cookies = self._ctx.settings.cookie_files()
        return self._ctx.jobs.submit(
            "instagram.probe", lambda ctx: instagram.probe(ctx, url, cookies), title=url, retryable=False, limited=False
        )

    def stop(self, job_id: str) -> bool:
        instagram.stop_listing(job_id)
        return True

    def start(self, params: Dict[str, Any]) -> str:
        cookies = self._ctx.settings.cookie_files()
        return self._ctx.jobs.submit(
            "instagram",
            lambda ctx: instagram.download(
                ctx, params["url"], params["outdir"], params.get("keys") or None, cookies
            ),
            title=params.get("title") or params["url"],
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
        title = Path(files[0]).name if len(files) == 1 else f'common.filesTitle|{{"count": {len(files)}}}'
        return self._ctx.jobs.submit(
            "compressor",
            lambda ctx: compressor.compress(ctx, params),
            title=title,
        )


class ImageEditorApi(_Namespace):
    def load_preview(self, path: str) -> Dict[str, Any]:
        return image_editor.load_preview(path)

    def thumbnail(self, path: str) -> Dict[str, Any]:
        return image_editor.thumbnail(path)

    def sizes(self, paths: List[str]) -> List[Optional[Dict[str, int]]]:
        return image_editor.image_sizes(paths)

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
        title = f'common.filesTitle|{{"count": {len(files)}}}'
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

    def frames(self, path: str, start_sec: float, duration: float, count: int, height: int = 96) -> Dict[str, Any]:
        return video_sync.extract_frames(path, float(start_sec), float(duration), int(count), int(height))

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


class VideoToGifApi(_Namespace):
    def probe(self, path: str) -> Dict[str, Any]:
        return {**ffmpeg.probe_media(path), "gifsicle": gif_render.gifsicle_available()}

    def frames(self, path: str, start_sec: float, duration: float, count: int, height: int = 96) -> Dict[str, Any]:
        return ffmpeg.extract_frames(path, float(start_sec), float(duration), int(count), int(height))

    def preview(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return video_to_gif.preview(params["path"], params)

    def start(self, params: Dict[str, Any]) -> str:
        return self._ctx.jobs.submit(
            "video_to_gif.render",
            lambda ctx: video_to_gif.render(ctx, params),
            title=Path(params["path"]).name,
        )


class MediaConvertApi(_Namespace):
    def probe(self, path: str) -> Dict[str, Any]:
        return ffmpeg.probe_media(path)

    def frames(self, path: str, start_sec: float, duration: float, count: int, height: int = 96) -> Dict[str, Any]:
        return ffmpeg.extract_frames(path, float(start_sec), float(duration), int(count), int(height))

    def start(self, params: Dict[str, Any]) -> str:
        paths = params.get("paths") or []
        title = Path(paths[0]).name if len(paths) == 1 else f'common.filesTitle|{{"count": {len(paths)}}}'
        return self._ctx.jobs.submit(
            "media_convert",
            lambda ctx: media_convert.convert(ctx, params),
            title=title,
        )


class TranscribeApi(_Namespace):
    def models(self) -> List[Dict[str, Any]]:
        return transcribe.models()

    def probe(self, path: str) -> Dict[str, Any]:
        return transcribe.probe(path)

    def start(self, params: Dict[str, Any]) -> str:
        return self._ctx.jobs.submit(
            "transcribe",
            lambda ctx: transcribe.run(ctx, params),
            title=Path(params["path"]).name,
        )


class GifEditorApi(_Namespace):
    def load(self, path: str) -> Dict[str, Any]:
        return {**gif_editor.load(path), "gifsicle": gif_render.gifsicle_available()}

    def frames(self, path: str, start_sec: float, duration: float, count: int, height: int = 96) -> Dict[str, Any]:
        return gif_editor.frames(path, float(start_sec), float(duration), int(count), int(height))

    def preview(self, path: str, operations: Dict[str, Any], output: Dict[str, Any]) -> Dict[str, Any]:
        return gif_editor.preview(path, operations, output)

    def start(self, params: Dict[str, Any]) -> str:
        files = params.get("files") or [params["path"]]
        title = Path(files[0]).name if len(files) == 1 else f'common.filesTitle|{{"count": {len(files)}}}'
        return self._ctx.jobs.submit(
            "gif_editor.render",
            lambda ctx: gif_editor.render(ctx, params),
            title=title,
        )


class Api:
    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self._ctx = _Context(bus, settings)
        deps.ensure_app_paths(settings.get("customFfmpegPath"))
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
        self.instagram = InstagramApi(self._ctx)
        self.watermark = WatermarkApi(self._ctx)
        self.progress = ProgressApi(self._ctx)
        self.upscale = UpscaleApi(self._ctx)
        self.rembg = RemBgApi(self._ctx)
        self.compressor = CompressorApi(self._ctx)
        self.image_editor = ImageEditorApi(self._ctx)
        self.video_sync = VideoSyncApi(self._ctx)
        self.video_to_gif = VideoToGifApi(self._ctx)
        self.media_convert = MediaConvertApi(self._ctx)
        self.gif_editor = GifEditorApi(self._ctx)
        self.transcribe = TranscribeApi(self._ctx)

    def _attach_window(self, window: Any) -> None:
        self._ctx.window = window
        self._ctx.bus.attach(window)
        self._ctx.shell.attach(window)
        self._ctx.shell.start()

    def _restart_requested(self) -> bool:
        return self._ctx.shell.restart_requested

    def _show_window(self) -> None:
        self._ctx.shell.show()

    def _open_link(self, uri: Optional[str]) -> None:
        if uri:
            self._ctx.shell.open_link(uri)

    def _set_mica(self, active: bool) -> None:
        self._ctx.mica = active

    def _on_closing(self) -> Optional[bool]:
        if self._ctx.shell.on_closing() is False:
            return False  # hidden to the tray (or the user chose to stay)
        self._ctx.bus.detach()
        return None

    def _shutdown(self) -> None:
        self._ctx.hotkey.stop()
        self._ctx.shell.stop()
        self._ctx.bus.detach()
        if not self._ctx.jobs.shutdown(timeout=SHUTDOWN_WAIT_S):
            logger.warning("Jobs still running %.0f s after Cancel; quitting anyway", SHUTDOWN_WAIT_S)
        self._ctx.bus.close()

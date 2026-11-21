// Typed access to the Python backend (window.pywebview.api) plus the Python → JS event bus.
//
// Calls:  await api.converter.start(opts)  → job id; progress arrives as "job:*" events.
// Events: const off = on("job:progress", (e) => ...);
//
// Outside pywebview (plain `npm run dev` in a browser) a mock backend is used so the UI
// can be developed and previewed without Python.

import type {
  AnimationInfo,
  AppInfo,
  Backdrop,
  BridgeEventName,
  BridgeEvents,
  ClearCacheResult,
  ClipboardLink,
  DownloadSubtitles,
  Dependency,
  EngineInfo,
  GifEditorPreview,
  GifOperations,
  GifOutputOptions,
  HardwareInfo,
  HistoryEntry,
  PendingQueue,
  RemBgOptions,
  RemBgPreview,
  Settings,
  ShellLabels,
  StorageInfo,
  TranscribeParams,
  SyncPreviewResult,
  UpscaleOptions,
  UpscalePreview,
  VideoEncoders,
  VideoFrame,
  VideoInfo,
  VideoSyncParams,
  VideoToGifParams,
  MediaConvertParams,
  OcrLanguage,
  VideoToGifPreview,
  WaveformData,
  WhisperModelInfo,
} from "./types";
import { createMockBackend } from "./mock";

type Handler<E extends BridgeEventName> = (payload: BridgeEvents[E]) => void;
type RawApi = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;

declare global {
  interface Window {
    pywebview?: { api: RawApi };
    __bridge?: { emitBatch(batch: { event: string; payload: unknown }[]): void };
  }
}

const listeners = new Map<string, Set<(payload: unknown) => void>>();

export function emitLocal(event: string, payload: unknown): void {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[bridge] handler for ${event} failed`, err);
    }
  });
}

window.__bridge = {
  emitBatch(batch) {
    for (const { event, payload } of batch) emitLocal(event, payload);
  },
};

export function on<E extends BridgeEventName>(event: E, handler: Handler<E>): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(handler as (payload: unknown) => void);
  listeners.set(event, set);
  return () => set.delete(handler as (payload: unknown) => void);
}

// ---------------------------------------------------------------------------

export type BackendMode = "native" | "mock";
const NATIVE_WAIT_MS = 1500;

let raw: RawApi | null = null;
let backendMode: BackendMode = "mock";

export const ready: Promise<BackendMode> = new Promise((resolve) => {
  const useNative = () => {
    raw = window.pywebview!.api;
    backendMode = "native";
    resolve("native");
  };
  if (window.pywebview?.api) return useNative();
  const timer = window.setTimeout(() => {
    raw = createMockBackend(emitLocal) as unknown as RawApi;
    backendMode = "mock";
    resolve("mock");
  }, NATIVE_WAIT_MS);
  window.addEventListener("pywebviewready", () => {
    window.clearTimeout(timer);
    useNative();
  });
});

export const getBackendMode = () => backendMode;

async function call<T>(ns: string, method: string, ...args: unknown[]): Promise<T> {
  await ready;
  const fn = raw?.[ns]?.[method];
  if (!fn) throw new Error(`Backend method ${ns}.${method} is not available`);
  return (await fn(...args)) as T;
}

// ---------------------------------------------------------------------------
// Typed API surface (mirrors backend/bridge/api.py)

export type JobId = string;

export const api = {
  app: {
    ready: () => call<AppInfo>("app", "ready"),
    info: () => call<AppInfo>("app", "info"),
    setTitleBarTheme: (dark: boolean) => call<boolean>("app", "set_title_bar_theme", dark),
    setBackdrop: (kind: Backdrop) => call<boolean>("app", "set_backdrop", kind),
    notify: (title: string, body: string, force = false) => call<boolean>("app", "notify", title, body, force),
    setShellLabels: (labels: ShellLabels) => call<void>("app", "set_shell_labels", labels),
    reportError: (source: string, message: string, stack: string) => call<void>("app", "report_error", source, message, stack),
    setTaskbarProgress: (state: string, value: number) => call<void>("app", "set_taskbar_progress", state, value),
  },
  settings: {
    get: () => call<Settings>("settings", "get"),
    update: (patch: Partial<Settings>) => call<Settings>("settings", "update", patch),
    reset: () => call<Settings>("settings", "reset"),
  },
  dialogs: {
    openFiles: (fileTypes: string[] = [], multiple = true, directory = "") =>
      call<string[]>("dialogs", "open_files", fileTypes, multiple, directory),
    openFolder: (directory = "") => call<string | null>("dialogs", "open_folder", directory),
    saveFile: (filename = "", fileTypes: string[] = [], directory = "") =>
      call<string | null>("dialogs", "save_file", filename, fileTypes, directory),
  },
  system: {
    openPath: (path: string) => call<void>("system", "open_path", path),
    reveal: (path: string) => call<void>("system", "reveal", path),
    dependencies: () => call<Dependency[]>("system", "dependencies"),
    installDependency: (id: string) => call<JobId>("system", "install_dependency", id),
    storageInfo: () => call<StorageInfo>("system", "storage_info"),
    clearCache: () => call<ClearCacheResult>("system", "clear_cache"),
    hardwareInfo: () => call<HardwareInfo>("system", "hardware_info"),
    openAppData: () => call<void>("system", "open_app_data"),
    openLogs: () => call<void>("system", "open_logs"),
    engines: () => call<EngineInfo[]>("system", "engines"),
    checkEngines: () => call<EngineInfo[]>("system", "check_engines"),
    updateEngines: () => call<JobId>("system", "update_engines"),
    resetEngines: () => call<EngineInfo[]>("system", "reset_engines"),
    restart: () => call<void>("system", "restart"),
    clipboardLink: () => call<ClipboardLink | null>("system", "clipboard_link"),
    pathInfo: (path: string) =>
      call<{ exists: boolean; isDir: boolean; isFile: boolean; name: string; parent: string }>("system", "path_info", path),
  },
  jobs: {
    cancel: (id: JobId) => call<boolean>("jobs", "cancel", id),
    retry: (id: JobId) => call<JobId | null>("jobs", "retry", id),
    /** Runs a job from the history again with the same files and settings; the new job's id. */
    rerun: (id: JobId) => call<JobId>("jobs", "rerun", id),
    history: () => call<HistoryEntry[]>("jobs", "history"),
    removeHistory: (id: JobId) => call<boolean>("jobs", "remove_history", id),
    clearHistory: () => call<void>("jobs", "clear_history"),
  },
  converter: {
    countFiles: (inputDir: string, inFormat: string) => call<number>("converter", "count_files", inputDir, inFormat),
    start: (options: {
      outputDir: string;
      outFormat: string;
      inFormat?: string;
      inputDir?: string;
      files?: string[];
      quality?: number;
      method?: number;
    }) => call<JobId>("converter", "start", options),
  },
  pdf: {
    inspect: (paths: string[]) => call<JobId>("pdf", "inspect", paths),
    renderPage: (path: string, page: number) => call<string>("pdf", "render_page", path, page),
    merge: (pages: { file: string; page: number }[], outPath: string) => call<JobId>("pdf", "merge", pages, outPath),
    compress: (path: string, outPath: string, quality: "low" | "balanced" | "high") =>
      call<JobId>("pdf", "compress", path, outPath, quality),
    /** `groups` holds 0-based page indexes; each group becomes one output file. */
    split: (path: string, outDir: string, mode: "all" | "groups", groups: number[][] = []) =>
      call<JobId>("pdf", "split", path, outDir, mode, groups),
    toImages: (path: string, outDir: string, fmt: "png" | "jpeg" | "webp", dpi: number, rangeSpec = "") =>
      call<JobId>("pdf", "pdf_to_images", path, outDir, fmt, dpi, rangeSpec),
    fromImages: (paths: string[], outPath: string) => call<JobId>("pdf", "images_to_pdf", paths, outPath),
    extractText: (path: string, outPath: string) => call<JobId>("pdf", "extract_text", path, outPath),
  },
  duplicates: {
    scan: (folder: string, mode: "video" | "image", threshold?: number) =>
      call<JobId>("duplicates", "scan", folder, mode, threshold ?? 12),
    exportCsv: (groups: unknown[][], outPath: string) => call<string>("duplicates", "export_csv", groups, outPath),
    trash: (paths: string[]) => call<JobId>("duplicates", "trash", paths),
  },
  tts: {
    voices: (engine: "edge" | "pyttsx3") =>
      call<{ id: string; name: string; locale: string; gender: string }[]>("tts", "voices", engine),
    synthesize: (params: { text: string; engine: string; voice: string; rate: string | number; outPath: string }) =>
      call<JobId>("tts", "synthesize", params),
    audioUrl: (path: string) => call<string>("tts", "audio_url", path),
    readText: (path: string) => call<string>("tts", "read_text", path),
  },
  download: {
    probe: (url: string) => call<JobId>("download", "probe", url),
    start: (params: {
      url: string;
      formatId: string;
      outdir: string;
      template?: string;
      mode?: "video" | "audio" | "muxed";
      audioCodec?: string;
      title?: string;
      subtitles?: DownloadSubtitles;
      sponsorblock?: boolean;
      section?: { start: number; end: number } | null;
    }) => call<JobId>("download", "start", params),
    batch: (params: {
      urls: string[];
      outdir: string;
      template?: string;
      subtitles?: DownloadSubtitles;
      mode?: "video" | "audio";
      audioCodec?: string;
      maxHeight?: number;
      sponsorblock?: boolean;
    }) => call<JobId>("download", "batch", params),
    pendingQueue: () => call<PendingQueue | null>("download", "pending_queue"),
    resumeQueue: () => call<JobId>("download", "resume_queue"),
    discardQueue: () => call<boolean>("download", "discard_queue"),
    archiveCount: () => call<number>("download", "archive_count"),
    clearArchive: () => call<boolean>("download", "clear_archive"),
    addToBatch: (params: { jobId?: string; urls: string[] }) =>
      call<{ success: boolean }>("download", "add_to_batch", params),
    /** `order` lists the queue's item indexes as shown after dragging. */
    reorderBatch: (params: { jobId: string; order: number[] }) => call<boolean>("download", "reorder_batch", params),
    skipBatchItem: (params: { jobId: string; index: number }) => call<boolean>("download", "skip_batch_item", params),
    /** The job that downloads the failed links again: the queue itself while it runs, else a new one. */
    retryFailed: (jobId: string) => call<JobId>("download", "retry_failed", jobId),
  },
  instagram: {
    probe: (url: string) => call<JobId>("instagram", "probe", url),
    stop: (jobId: JobId) => call<boolean>("instagram", "stop", jobId),
    start: (params: { url: string; outdir: string; keys: string[]; title?: string }) => call<JobId>("instagram", "start", params),
  },
  watermark: {
    load: (path: string) => call<{ path: string; width: number; height: number; dataUrl: string }>("watermark", "load", path),
    lamaAvailable: () => call<boolean>("watermark", "lama_available"),
    remove: (path: string, maskPng: string, method: "telea" | "ns" | "lama") =>
      call<JobId>("watermark", "remove", path, maskPng, method),
    save: (resultPath: string, outPath: string) => call<string>("watermark", "save", resultPath, outPath),
  },
  progress: {
    loadBanner: (path: string) => call<string>("progress", "load_banner", path),
    save: (dataUrl: string, outPath: string) => call<{ outPath: string; bytes: number }>("progress", "save", dataUrl, outPath),
  },
  upscale: {
    load: (path: string) => call<UpscalePreview>("upscale", "load", path),
    modelsStatus: () => call<{ general: boolean; anime: boolean }>("upscale", "models_status"),
    start: (params: UpscaleOptions) => call<JobId>("upscale", "start", params),
    save: (resultPath: string, outPath: string) => call<string>("upscale", "save", resultPath, outPath),
  },
  rembg: {
    load: (path: string) => call<RemBgPreview>("rembg", "load", path),
    isAvailable: () => call<boolean>("rembg", "is_available"),
    remove: (params: RemBgOptions) => call<JobId>("rembg", "remove", params),
    save: (resultPath: string, outPath: string) => call<string>("rembg", "save", resultPath, outPath),
  },
  compressor: {
    loadPreview: (path: string) =>
      call<{
        path: string;
        fileName: string;
        size: number;
        width: number;
        height: number;
        format: string;
        hasAlpha: boolean;
        dataUrl: string;
      }>("compressor", "load_preview", path),
    preview: (
      path: string,
      params: {
        format?: string;
        mode?: string;
        quality?: number;
        targetKb?: number;
      },
    ) =>
      call<{
        compressedBytes: number;
        savedBytes: number;
        savedPercent: number;
        dataUrl: string;
      }>("compressor", "preview", path, params),
    start: (params: {
      files?: string[];
      path?: string;
      outputDir?: string;
      outPath?: string;
      format: string;
      mode: string;
      quality?: number;
      targetKb?: number;
    }) => call<JobId>("compressor", "start", params),
  },
  image_editor: {
    thumbnail: (path: string) =>
      call<{ width: number; height: number; format: string; size: number; dataUrl: string }>("image_editor", "thumbnail", path),
    sizes: (paths: string[]) => call<Array<{ width: number; height: number } | null>>("image_editor", "sizes", paths),
    loadPreview: (path: string) =>
      call<{
        path: string;
        fileName: string;
        size: number;
        width: number;
        height: number;
        format: string;
        hasAlpha: boolean;
        dataUrl: string;
      }>("image_editor", "load_preview", path),
    previewTransform: (
      path: string,
      operations: Record<string, unknown>,
    ) =>
      call<{
        width: number;
        height: number;
        hasAlpha: boolean;
        dataUrl: string;
      }>("image_editor", "preview_transform", path, operations),
    saveTransformed: (
      srcPath: string,
      targetPath: string,
      operations: Record<string, unknown>,
      outFmt?: string,
      quality?: number,
    ) =>
      call<{
        outPath: string;
        width: number;
        height: number;
        bytes: number;
      }>("image_editor", "save_transformed", srcPath, targetPath, operations, outFmt, quality ?? 90),
    startBatch: (
      files: string[],
      outputDir: string,
      operations: Record<string, unknown> | Record<string, Record<string, unknown>>,
      outFmt?: string,
      quality?: number,
    ) => call<JobId>("image_editor", "start_batch", files, outputDir, operations, outFmt, quality ?? 90),
  },
  video_sync: {
    probe: (path: string) => call<VideoInfo>("video_sync", "probe", path),
    waveform: (path: string, points = 1200, startSec = 0, duration?: number, streamIdx?: number) =>
      call<WaveformData>("video_sync", "waveform", path, points, startSec, duration, streamIdx),
    frames: (path: string, startSec: number, duration: number, count: number, height = 96) =>
      call<{ frames: VideoFrame[] }>("video_sync", "frames", path, startSec, duration, count, height),
    preview: (params: {
      videoPath: string;
      offsetSec: number;
      startSec?: number;
      duration?: number;
      audioPath?: string;
      audioTrackIndex?: number;
    }) => call<SyncPreviewResult>("video_sync", "preview", params),
    start: (params: VideoSyncParams) => call<JobId>("video_sync", "start", params),
  },
  media_convert: {
    probe: (path: string) => call<VideoInfo>("media_convert", "probe", path),
    frames: (path: string, startSec: number, duration: number, count: number, height: number) =>
      call<{ frames: VideoFrame[] }>("media_convert", "frames", path, startSec, duration, count, height),
    encoders: () => call<VideoEncoders>("media_convert", "encoders"),
    copyFormats: (paths: string[]) => call<string[]>("media_convert", "copy_formats", paths),
    start: (params: MediaConvertParams) => call<JobId>("media_convert", "start", params),
  },
  video_to_gif: {
    probe: (path: string) => call<VideoInfo & { gifsicle: boolean }>("video_to_gif", "probe", path),
    frames: (path: string, startSec: number, duration: number, count: number, height = 96) =>
      call<{ frames: VideoFrame[] }>("video_to_gif", "frames", path, startSec, duration, count, height),
    preview: (params: VideoToGifParams) => call<VideoToGifPreview>("video_to_gif", "preview", params),
    start: (params: VideoToGifParams & { outPath: string }) => call<JobId>("video_to_gif", "start", params),
  },
  transcribe: {
    models: () => call<WhisperModelInfo[]>("transcribe", "models"),
    probe: (path: string) => call<VideoInfo>("transcribe", "probe", path),
    start: (params: TranscribeParams) => call<JobId>("transcribe", "start", params),
  },
  ocr: {
    languages: () => call<OcrLanguage[]>("ocr", "languages"),
    images: (params: { paths: string[]; language: string }) => call<JobId>("ocr", "images", params),
    /** Without `outPath` only the text is read; with it, a copy with an invisible text layer is saved too. */
    pdf: (params: { path: string; language: string; outPath?: string }) => call<JobId>("ocr", "pdf", params),
    clipboardImage: () => call<string[]>("ocr", "clipboard_image"),
    saveText: (text: string, outPath: string) => call<string>("ocr", "save_text", text, outPath),
  },
  gif_editor: {
    load: (path: string) => call<AnimationInfo>("gif_editor", "load", path),
    frames: (path: string, startSec: number, duration: number, count: number, height = 96) =>
      call<{ frames: VideoFrame[] }>("gif_editor", "frames", path, startSec, duration, count, height),
    preview: (path: string, operations: GifOperations, output: GifOutputOptions) =>
      call<GifEditorPreview>("gif_editor", "preview", path, operations, output),
    start: (
      params:
        | { path: string; outPath: string; operations: GifOperations; output: GifOutputOptions }
        | { files: string[]; outputDir: string; operations: Record<string, GifOperations>; output: GifOutputOptions },
    ) => call<JobId>("gif_editor", "start", params),
  },
};


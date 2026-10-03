// Typed access to the Python backend (window.pywebview.api) plus the Python → JS event bus.
//
// Calls:  await api.converter.start(opts)  → job id; progress arrives as "job:*" events.
// Events: const off = on("job:progress", (e) => ...);
//
// Outside pywebview (plain `npm run dev` in a browser) a mock backend is used so the UI
// can be developed and previewed without Python.

import type { AppInfo, BridgeEventName, BridgeEvents, Dependency, JobInfo, Settings } from "./types";
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
// Backend resolution

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
  },
  settings: {
    get: () => call<Settings>("settings", "get"),
    update: (patch: Partial<Settings>) => call<Settings>("settings", "update", patch),
    addRecentFolder: (folder: string) => call<void>("settings", "add_recent_folder", folder),
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
    trash: (path: string) => call<void>("system", "trash", path),
    dependencies: () => call<Dependency[]>("system", "dependencies"),
    pathInfo: (path: string) =>
      call<{ exists: boolean; isDir: boolean; isFile: boolean; name: string; parent: string }>("system", "path_info", path),
  },
  jobs: {
    list: () => call<JobInfo[]>("jobs", "list"),
    get: (id: JobId) => call<JobInfo | null>("jobs", "get", id),
    cancel: (id: JobId) => call<boolean>("jobs", "cancel", id),
  },
  converter: {
    formats: () => call<string[]>("converter", "formats"),
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
  },
  duplicates: {
    scan: (folder: string, mode: "video" | "image", threshold?: number) =>
      call<JobId>("duplicates", "scan", folder, mode, threshold ?? 12),
    exportCsv: (groups: unknown[][], outPath: string) => call<string>("duplicates", "export_csv", groups, outPath),
  },
  tts: {
    voices: (engine: "edge" | "pyttsx3") =>
      call<{ id: string; name: string; locale: string; gender: string }[]>("tts", "voices", engine),
    synthesize: (params: { text: string; engine: string; voice: string; rate: string | number; outPath: string }) =>
      call<JobId>("tts", "synthesize", params),
    audioDataUrl: (path: string) => call<string>("tts", "audio_data_url", path),
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
    }) => call<JobId>("download", "start", params),
    batch: (params: { urls: string[]; outdir: string; template?: string }) => call<JobId>("download", "batch", params),
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
};

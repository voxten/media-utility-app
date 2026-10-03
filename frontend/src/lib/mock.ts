// In-browser stand-in for the Python backend, used when the UI runs outside pywebview
// (e.g. `npm run dev` opened in a normal browser). Data is fake; jobs are simulated.

import type { Settings } from "./types";

type Emit = (event: string, payload: unknown) => void;

const SETTINGS_KEY = "mock-settings";
const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "pl",
  outputDir: "C:\\Users\\demo\\Downloads",
  cookies: { youtube: "", x: "" },
  recentFolders: ["C:\\Users\\demo\\Pictures", "C:\\Users\\demo\\Videos"],
};

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    /* storage may be unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function createMockBackend(emit: Emit) {
  let settings = loadSettings();
  const running = new Map<string, number>();
  let counter = 0;

  const simulateJob = (kind: string, title: string, result: unknown, durationMs = 2500): Promise<string> => {
    const jobId = `mock${++counter}`;
    const started = Date.now();
    emit("job:started", {
      id: jobId, kind, title, status: "running", startedAt: started / 1000,
      finishedAt: null, error: null, percent: 0, message: null, params: {},
    });
    const timer = window.setInterval(() => {
      const percent = Math.min(100, ((Date.now() - started) / durationMs) * 100);
      emit("job:progress", { jobId, percent, message: "common.status.working", params: {} });
      if (percent >= 100) {
        window.clearInterval(timer);
        running.delete(jobId);
        emit("job:done", { jobId, result });
      }
    }, 150);
    running.set(jobId, timer);
    return Promise.resolve(jobId);
  };

  const ok = <T>(value: T) => Promise.resolve(value);

  return {
    app: {
      ready: () => ok({ name: "Media Studio", version: "0.5.0-mock", python: "—", platform: navigator.userAgent }),
      info: () => ok({ name: "Media Studio", version: "0.5.0-mock", python: "—", platform: navigator.userAgent }),
      set_title_bar_theme: () => ok(false),
    },
    settings: {
      get: () => ok(settings),
      update: (patch: Partial<Settings>) => {
        settings = { ...settings, ...patch, cookies: { ...settings.cookies, ...(patch.cookies ?? {}) } };
        saveSettings(settings);
        return ok(settings);
      },
      add_recent_folder: (folder: string) => {
        settings = { ...settings, recentFolders: [folder, ...settings.recentFolders.filter((f) => f !== folder)].slice(0, 8) };
        saveSettings(settings);
        return ok(undefined);
      },
    },
    dialogs: {
      open_files: () => ok(["C:\\Users\\demo\\Documents\\example.pdf"]),
      open_folder: () => ok("C:\\Users\\demo\\Pictures"),
      save_file: (filename: string) => ok(`C:\\Users\\demo\\Downloads\\${filename || "output"}`),
    },
    system: {
      open_path: () => ok(undefined),
      reveal: () => ok(undefined),
      trash: () => ok(undefined),
      dependencies: () =>
        ok([
          { id: "ffmpeg", ok: true, detail: "C:\\ffmpeg\\bin\\ffmpeg.exe", usedBy: ["download", "tts"], required: true },
          { id: "mediainfo", ok: true, detail: "", usedBy: ["duplicates"], required: true },
          { id: "lama", ok: false, detail: "pip install iopaint torch torchvision", usedBy: ["watermark"], required: false },
        ]),
      path_info: (path: string) => ok({ exists: true, isDir: !path.includes("."), isFile: path.includes("."), name: path.split("\\").pop(), parent: "" }),
    },
    jobs: {
      list: () => ok([]),
      get: () => ok(null),
      cancel: (id: string) => {
        const timer = running.get(id);
        if (timer === undefined) return ok(false);
        window.clearInterval(timer);
        running.delete(id);
        emit("job:cancelled", { jobId: id });
        return ok(true);
      },
    },
    converter: {
      formats: () => ok(["PNG", "WEBP", "JPEG", "GIF", "TIFF", "BMP", "PDF"]),
      count_files: () => ok(12),
      start: () => simulateJob("converter", "WEBP", { total: 12, converted: 12, failed: 0, inputBytes: 9_000_000, outputBytes: 2_100_000, outputDir: "C:\\out" }),
    },
    pdf: {
      inspect: () => simulateJob("pdf.inspect", "", { pages: [], errors: [] }, 800),
      render_page: () => ok(""),
      merge: () => simulateJob("pdf.merge", "merged.pdf", { outPath: "C:\\merged.pdf", pageCount: 3, bytes: 1000 }),
    },
    duplicates: {
      scan: () => simulateJob("duplicates.image", "Pictures", { groups: [], scanned: 40, failed: 0, mode: "image" }),
      export_csv: (_groups: unknown, outPath: string) => ok(outPath),
    },
    tts: {
      voices: () => ok([{ id: "pl-PL-ZofiaNeural", name: "Zofia", locale: "pl-PL", gender: "Female" }]),
      synthesize: () => simulateJob("tts", "speech.mp3", { outPath: "C:\\speech.mp3", bytes: 1000 }),
      audio_data_url: () => ok(""),
    },
    download: {
      probe: () => simulateJob("download.probe", "", { url: "", title: "Demo video", uploader: "Demo", duration: 60, thumbnail: null, formats: { video: [], audio: [], muxed: [] } }, 800),
      start: () => simulateJob("download", "Demo video", { title: "Demo video", path: "", outdir: "C:\\Downloads" }),
      batch: () => simulateJob("download.batch", "2 URL", { items: [], succeeded: 2, failed: 0, outdir: "C:\\Downloads" }),
    },
    watermark: {
      load: () => ok({ path: "", width: 0, height: 0, dataUrl: "" }),
      lama_available: () => ok(false),
      remove: () => simulateJob("watermark", "image.png", { resultPath: "", dataUrl: "", notice: null }),
      save: (_r: string, out: string) => ok(out),
    },
    progress: {
      load_banner: () => ok(""),
      save: (_d: string, outPath: string) => ok({ outPath, bytes: 0 }),
    },
  };
}

// In-browser stand-in for the Python backend, used when the UI runs outside pywebview
// (e.g. `npm run dev` opened in a normal browser). Data is fake; jobs are simulated.

import type { EngineInfo, HistoryEntry, Settings } from "./types";

type Emit = (event: string, payload: unknown) => void;

const SETTINGS_KEY = "mock-settings";
const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "pl",
  mica: false,
  outputDir: "C:\\Users\\demo\\Downloads",
  cookies: { youtube: "", x: "", instagram: "" },
  cookiesFromBrowser: "",
  maxConcurrency: 4,
  desktopNotifications: true,
  completionSound: true,
  customFfmpegPath: "",
  confirmExitOnActiveJobs: true,
  closeToTray: true,
  clipboardWatch: false,
  clipboardLastLink: "",
  globalHotkey: "",
  lastSeenVersion: "",
  engineUpdateCheck: true,
  downloadEmbedMeta: true,
  downloadSkipArchived: false,
  downloadParallel: 1,
  downloadRateLimit: 0,
  engineLastCheck: 0,
};

/** Lets the browser mock show what happens when another program owns the chosen shortcut. */
const MOCK_TAKEN_HOTKEY = "ctrl+alt+shift+y";

const MOCK_ENGINES: EngineInfo[] = [
  { id: "yt-dlp", version: "2026.8.19", latest: "2026.10.26", updateAvailable: true, restartRequired: false, downloaded: false },
  { id: "gallery-dl", version: "1.32.19", latest: "1.32.19", updateAvailable: false, restartRequired: false, downloaded: false },
];

const HOUR = 3600;
const mockHistory = (now: number): HistoryEntry[] => [
  {
    id: "hist1", kind: "converter", title: "WEBP", status: "done", startedAt: now - 2 * HOUR - 40, finishedAt: now - 2 * HOUR,
    error: null, outputs: ["C:\\Users\\demo\\Pictures\\converted\\holiday.webp"], available: true, singleFile: true,
  },
  {
    id: "hist2", kind: "download", title: "Big Buck Bunny", status: "done", startedAt: now - 26 * HOUR - 95, finishedAt: now - 26 * HOUR,
    error: null, outputs: ["C:\\Users\\demo\\Downloads\\Big Buck Bunny.mp4"], available: false,
    meta: { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
  },
  {
    id: "hist4", kind: "download.batch", title: 'download.batchTitle|{"count":3}', status: "done",
    startedAt: now - 27 * HOUR - 300, finishedAt: now - 27 * HOUR, error: null,
    outputs: ["C:\\Users\\demo\\Downloads\\Sintel.mp4", "C:\\Users\\demo\\Downloads\\Tears of Steel.mp4"], available: true,
    stats: { succeeded: 2, failed: 1, total: 3 },
    items: [
      { index: 0, url: "https://www.youtube.com/watch?v=eRsGyueVLvQ", title: "Sintel", status: "done", size: 182_000_000 },
      { index: 1, url: "https://www.youtube.com/watch?v=R6MlUcmOul8", title: "Tears of Steel", status: "done", size: 240_000_000 },
      { index: 2, url: "https://x.com/demo/status/1", status: "error", error: "Video unavailable" },
    ],
  },
  {
    id: "hist5", kind: "download.batch", title: 'download.batchTitle|{"count":2}', status: "cancelled",
    startedAt: now - 28 * HOUR - 60, finishedAt: now - 28 * HOUR, error: null, outputs: [], available: false,
    meta: { urls: ["https://www.youtube.com/watch?v=demo1", "https://www.youtube.com/watch?v=demo2"] },
  },
  {
    id: "hist3", kind: "compressor", title: "", status: "error", startedAt: now - 50 * HOUR - 5, finishedAt: now - 50 * HOUR,
    error: "cannot identify image file", outputs: [], available: false,
  },
];

/** History entry for a finished mock job, using the same result shapes as the backend. */
function historyEntry(job: { id: string; kind: string; title: string; startedAt: number }, result: unknown): HistoryEntry {
  const r = (result ?? {}) as Record<string, unknown>;
  const files = Array.isArray(r.files) ? r.files.filter((f): f is string => typeof f === "string") : [];
  const single = [r.outPath, r.path].filter((p): p is string => typeof p === "string" && p !== "");
  const outputs = single.length || files.length ? [...single, ...files] : [r.outputDir, r.outdir].filter((p): p is string => typeof p === "string");
  return {
    id: job.id, kind: job.kind, title: job.title, status: "done", startedAt: job.startedAt, finishedAt: Date.now() / 1000,
    error: null, outputs, available: outputs.length > 0, singleFile: single.length + files.length === 1,
  };
}

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

function fakePageThumb(fileIndex: number, page: number): string {
  const hue = (fileIndex * 67 + 200) % 360;
  const lines = Array.from({ length: 9 }, (_, i) => `<rect x="14" y="${40 + i * 9}" width="${60 + ((i * 13 + page * 7) % 30)}" height="4" rx="2" fill="#ccc"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="170"><rect width="120" height="170" fill="#fff"/><rect x="14" y="14" width="70" height="12" rx="3" fill="hsl(${hue},60%,55%)"/>${lines}<text x="106" y="160" font-size="10" text-anchor="end" fill="#999">${page + 1}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function fakePhoto(seed: number): string {
  const skies = ["#7fb3e6", "#f0a35e", "#9ad0c2"];
  const grounds = ["#4f7a3a", "#a0522d", "#2e6f8e"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${skies[seed % 3]}"/><circle cx="${240 - seed * 40}" cy="60" r="26" fill="#fff6c8"/><path d="M0 150 L80 90 L150 140 L230 80 L320 140 L320 200 L0 200Z" fill="${grounds[seed % 3]}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function createMockBackend(emit: Emit) {
  let settings = loadSettings();
  const running = new Map<string, number>();
  let counter = 0;
  let engines = MOCK_ENGINES;
  let history = mockHistory(Date.now() / 1000);
  let mockPendingQueue = ["https://youtube.com/watch?v=left1", "https://youtube.com/watch?v=left2", "https://youtube.com/watch?v=left3"];
  let mockArchiveCount = 42;
  const NOT_RETRYABLE = ["download.probe", "instagram.probe", "pdf.inspect", "duplicates.trash"];
  const NOT_IN_HISTORY = [...NOT_RETRYABLE, "download.engines"];

  const simulateJob = (kind: string, title: string, result: unknown, durationMs = 2500): Promise<string> => {
    const jobId = `mock${++counter}`;
    const started = Date.now();
    emit("job:started", {
      id: jobId, kind, title, status: "running", startedAt: started / 1000,
      finishedAt: null, error: null, percent: 0, message: null, params: {}, retryable: !NOT_RETRYABLE.includes(kind),
    });
    const timer = window.setInterval(() => {
      const percent = Math.min(100, ((Date.now() - started) / durationMs) * 100);
      emit("job:progress", { jobId, percent, message: "common.status.working", params: {} });
      if (percent >= 100) {
        window.clearInterval(timer);
        running.delete(jobId);
        emit("job:done", { jobId, result });
        if (!NOT_IN_HISTORY.includes(kind)) {
          const entry = historyEntry({ id: jobId, kind, title, startedAt: started / 1000 }, result);
          history = [entry, ...history];
          emit("jobs:history", entry);
        }
      }
    }, 150);
    running.set(jobId, timer);
    return Promise.resolve(jobId);
  };

  const ok = <T>(value: T) => Promise.resolve(value);

  interface MockQueueItem {
    index: number;
    url: string;
    title: string;
    status: "pending" | "running" | "done" | "error" | "cancelled";
    percent: number;
    size?: number;
  }
  interface MockQueue {
    items: MockQueueItem[];
    order: number[];
    outdir: string;
    closed: boolean;
  }
  const mockQueues = new Map<string, MockQueue>();
  const MOCK_ITEM_SPEED = 2_600_000;

  const reportBatch = (jobId: string, queue: MockQueue) => {
    const runningItems = queue.order.map((index) => queue.items[index]).filter((item) => item.status === "running");
    const finished = queue.items.filter((item) => item.status !== "pending" && item.status !== "running").length;
    const percent = (finished * 100 + runningItems.reduce((acc, item) => acc + item.percent, 0)) / Math.max(1, queue.items.length);
    emit("job:progress", {
      jobId,
      percent,
      message: runningItems.length > 1 ? "download.status.downloadingMany" : "download.status.downloading",
      params: runningItems.length > 1 ? { count: runningItems.length } : {},
      running: runningItems.map((item) => ({ index: item.index, percent: item.percent, speed: MOCK_ITEM_SPEED, total: 24_500_000 })),
      order: [...queue.order],
      speed: runningItems.length ? runningItems.length * MOCK_ITEM_SPEED : undefined,
    });
  };

  /** A queue of links downloaded `downloadParallel` at a time; links containing "fail" fail. */
  const simulateBatch = (urls: string[], outdir: string): string => {
    const jobId = `mock${++counter}`;
    const queue: MockQueue = {
      items: urls.map((url, index) => ({ index, url, title: url, status: "pending", percent: 0 })),
      order: urls.map((_, index) => index),
      outdir,
      closed: false,
    };
    mockQueues.set(jobId, queue);
    emit("job:started", {
      id: jobId,
      kind: "download.batch",
      title: `download.batchTitle|{"count":${urls.length}}`,
      status: "running",
      startedAt: Date.now() / 1000,
      finishedAt: null,
      error: null,
      percent: 0,
      message: null,
      params: {},
    });
    queue.items.forEach((item) => emit("job:partial", { jobId, data: { index: item.index, url: item.url, status: "pending" } }));
    const timer = window.setInterval(() => {
      for (const item of queue.items) {
        if (item.status !== "running") continue;
        item.percent = Math.min(100, item.percent + 4 + (item.index % 3) * 2);
        if (item.percent < 100) continue;
        const failed = item.url.includes("fail");
        item.status = failed ? "error" : "done";
        item.title = failed ? item.url : `Film #${item.index + 1}`;
        item.size = failed ? undefined : 24_500_000 + item.index * 5_000_000;
        emit("job:partial", {
          jobId,
          data: failed
            ? { index: item.index, url: item.url, title: item.title, status: "error", error: "Video unavailable" }
            : { index: item.index, url: item.url, title: item.title, status: "done", size: item.size, duration: 2.5 },
        });
      }
      let busy = queue.items.filter((item) => item.status === "running").length;
      for (const index of queue.order) {
        const item = queue.items[index];
        if (busy >= settings.downloadParallel) break;
        if (item.status !== "pending") continue;
        item.status = "running";
        busy += 1;
        emit("job:partial", { jobId, data: { index, url: item.url, title: item.title, status: "running" } });
      }
      reportBatch(jobId, queue);
      if (busy > 0 || queue.items.some((item) => item.status === "pending")) return;
      window.clearInterval(timer);
      running.delete(jobId);
      queue.closed = true;
      const items = queue.order.map((index) => {
        const { url, title, status, size } = queue.items[index];
        const base = { index, url, title, status, size };
        return status === "done" ? { ...base, duration: 2.5 } : status === "error" ? { ...base, error: "Video unavailable" } : base;
      });
      const done = items.filter((item) => item.status === "done");
      emit("job:done", {
        jobId,
        result: {
          items,
          succeeded: done.length,
          failed: items.filter((item) => item.status === "error").length,
          totalSize: done.reduce((acc, item) => acc + (item.size ?? 0), 0),
          totalDuration: done.length * 2.5,
          outdir,
        },
      });
    }, 150);
    running.set(jobId, timer);
    return jobId;
  };

  const backend = {
    app: {
      ready: () => ok({ name: "Media Studio", version: "dev-mock", python: "—", platform: navigator.userAgent }),
      info: () => ok({ name: "Media Studio", version: "dev-mock", python: "—", platform: navigator.userAgent }),
      set_title_bar_theme: () => ok(false),
      set_taskbar_progress: () => ok(undefined),
      notify: () => ok(false),
      set_shell_labels: () => ok(undefined),
      report_error: () => ok(undefined),
    },
    settings: {
      get: () => ok(settings),
      update: (patch: Partial<Settings>) => {
        if (patch.globalHotkey === MOCK_TAKEN_HOTKEY) return Promise.reject(new Error("errors.hotkeyTaken"));
        settings = { ...settings, ...patch, cookies: { ...settings.cookies, ...(patch.cookies ?? {}) } };
        saveSettings(settings);
        return ok(settings);
      },
      reset: () => {
        settings = { ...DEFAULT_SETTINGS };
        saveSettings(settings);
        return ok(settings);
      },
    },
    dialogs: {
      open_files: (types: string[] = [], multiple = true) =>
        ok(
          types.some((t) => t.toLowerCase().includes("pdf"))
            ? ["C:\\Users\\demo\\Documents\\raport.pdf", "C:\\Users\\demo\\Documents\\umowa.pdf"]
            : types.some((t) => t.includes("*.mp4"))
              ? ["C:\\Users\\demo\\Videos\\clip.mp4"]
            : types.some((t) => t.includes("*.txt"))
              ? ["C:\\Users\\demo\\Documents\\notes.txt"]
            : types.some((t) => t.includes("*.apng"))
              ? ["C:\\Users\\demo\\Pictures\\cat.gif", "C:\\Users\\demo\\Pictures\\dance.gif"].slice(0, multiple ? 2 : 1)
            : multiple
              ? ["C:\\Users\\demo\\Pictures\\photo.png", "C:\\Users\\demo\\Pictures\\beach.jpg", "C:\\Users\\demo\\Pictures\\city.webp"]
              : ["C:\\Users\\demo\\Pictures\\photo.png"],
        ),
      open_folder: () => ok("C:\\Users\\demo\\Pictures"),
      save_file: (filename: string) => ok(`C:\\Users\\demo\\Downloads\\${filename || "output"}`),
    },
    system: {
      open_path: () => ok(undefined),
      reveal: () => ok(undefined),
      dependencies: () =>
        ok([
          { id: "ffmpeg", ok: true, detail: "C:\\ffmpeg\\bin\\ffmpeg.exe", usedBy: ["download", "tts"], required: true, installable: false, sizeEstimate: "" },
          { id: "mediainfo", ok: true, detail: "", usedBy: ["duplicates"], required: true, installable: false, sizeEstimate: "" },
          { id: "lama", ok: false, detail: "settings.deps.detailLamaModelOnly", usedBy: ["watermark"], required: false, installable: true, sizeEstimate: "~196 MB" },
        ]),
      install_dependency: (id: string) =>
        simulateJob(
          id === "lama" ? "watermark.install" : id.startsWith("whisper_") ? "transcribe.install" : "download.install",
          id,
          { id, ok: true },
          2500,
        ),
      engines: () => ok(engines),
      check_engines: () => ok(engines),
      update_engines: () => {
        engines = engines.map((e) => (e.updateAvailable ? { ...e, updateAvailable: false, restartRequired: true, downloaded: true } : e));
        return simulateJob("download.engines", "engines.updateTitle", { updated: ["yt-dlp"], engines }, 3000);
      },
      reset_engines: () => {
        engines = engines.map((e) => ({ ...e, restartRequired: e.downloaded !== e.restartRequired, downloaded: false }));
        return ok(engines);
      },
      restart: () => ok(undefined),
      storage_info: () =>
        ok({
          appDataDir: "C:\\Users\\demo\\AppData\\Roaming\\MediaStudio",
          cacheDir: "C:\\Users\\demo\\AppData\\Roaming\\MediaStudio\\cache",
          modelsDir: "C:\\Users\\demo\\AppData\\Local\\MediaStudio\\models",
          binDir: "C:\\Users\\demo\\AppData\\Roaming\\MediaStudio\\bin",
          cacheBytes: 52_428_800,
          cacheFiles: 28,
          modelsBytes: 1_468_006_400,
          modelsFiles: 4,
          binBytes: 73_400_320,
          binFiles: 2,
          totalAppDataBytes: 1_650_000_000,
          totalAppDataFiles: 350,
        }),
      clear_cache: () =>
        ok({
          freedBytes: 52_428_800,
          filesDeleted: 28,
          errors: [],
          success: true,
        }),
      hardware_info: () =>
        ok({
          cpuName: "AMD Ryzen 7 7800X3D 8-Core Processor",
          cpuThreads: 16,
          cpuArchitecture: "AMD64",
          gpus: ["NVIDIA GeForce RTX 4080 (16 GB)"],
          cudaAvailable: true,
          cudaDeviceName: "NVIDIA GeForce RTX 4080",
          cudaVersion: "12.1",
          ramTotalBytes: 34_359_738_368,
          ramAvailBytes: 21_474_836_480,
          osName: "Windows 11 Pro",
        }),
      open_app_data: () => ok(undefined),
      open_logs: () => ok(undefined),
      clipboard_link: () => ok({ url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", target: "download" }),
      path_info: (path: string) => ok({ exists: true, isDir: !path.includes("."), isFile: path.includes("."), name: path.split("\\").pop(), parent: "" }),
    },
    jobs: {
      cancel: (id: string) => {
        const timer = running.get(id);
        if (timer === undefined) return ok(false);
        window.clearInterval(timer);
        running.delete(id);
        emit("job:cancelled", { jobId: id });
        return ok(true);
      },
      retry: () => ok(null),
      history: () => ok(history),
      clear_history: () => {
        history = [];
        return ok(undefined);
      },
    },
    converter: {
      count_files: () => ok(12),
      start: () => simulateJob("converter", "WEBP", { total: 12, converted: 12, failed: 0, inputBytes: 9_000_000, outputBytes: 2_100_000, outputDir: "C:\\out" }),
    },
    pdf: {
      inspect: (paths: string[]) => {
        const pages = paths.flatMap((file, f) =>
          Array.from({ length: 3 }, (_, page) => ({
            file,
            fileName: file.split("\\").pop(),
            page,
            width: 595,
            height: 842,
            thumb: fakePageThumb(f, page),
          })),
        );
        const job = simulateJob("pdf.inspect", "", { pageCount: pages.length, errors: [] }, 800);
        void job.then((jobId) => pages.forEach((data) => emit("job:partial", { jobId, data })));
        return job;
      },
      render_page: (_path: string, page: number) => ok(fakePageThumb(0, page)),
      merge: () => simulateJob("pdf.merge", "merged.pdf", { outPath: "C:\\merged.pdf", pageCount: 3, bytes: 1000 }),
      compress: (path: string, outPath: string) =>
        simulateJob("pdf.compress", "compressed.pdf", { inPath: path, outPath, inBytes: 15_000_000, outBytes: 2_400_000, savedBytes: 12_600_000, savedPercent: 84.0 }),
      split: (_path: string, outDir: string) =>
        simulateJob("pdf.split", "split", { files: [`${outDir}\\strona_001.pdf`, `${outDir}\\strona_002.pdf`], count: 2, outDir }),
      pdf_to_images: (_path: string, outDir: string) =>
        simulateJob("pdf.to_images", "images", { files: [`${outDir}\\page_001.png`, `${outDir}\\page_002.png`], count: 2, outDir }),
      images_to_pdf: (_paths: string[], outPath: string) =>
        simulateJob("pdf.from_images", "doc.pdf", { outPath, pageCount: 2, bytes: 500_000 }),
      extract_text: (_path: string, outPath: string) =>
        simulateJob("pdf.extract_text", "text.txt", { outPath, charCount: 1200, bytes: 1200 }),
    },
    duplicates: {
      scan: (_folder: string, mode: string) => {
        const groups = [0, 1, 2].map((g) =>
          Array.from({ length: g === 1 ? 3 : 2 }, (_, i) => ({
            path: `C:\\Users\\demo\\Pictures\\${g === 1 ? "wakacje" : "2024"}\\IMG_${1040 + g * 7}${i ? `_kopia${i}` : ""}.jpg`,
            filename: `IMG_${1040 + g * 7}${i ? `_kopia${i}` : ""}.jpg`,
            size: 3_400_000 - i * 900_000 + g * 120_000,
            width: 4032 - i * 1000,
            height: 3024 - i * 750,
            duration: mode === "video" ? 61_000 : null,
            thumb: fakePhoto(g),
          })),
        );
        return simulateJob(`duplicates.${mode}`, "Pictures", { groups, scanned: 148, failed: 1, mode }, 1500);
      },
      export_csv: (_groups: unknown, outPath: string) => ok(outPath),
      trash: (paths: string[]) => simulateJob("duplicates.trash", "Pictures", { removed: paths, count: paths.length, failed: 0, errors: [] }, 1500),
    },
    tts: {
      voices: () =>
        ok([
          { id: "pl-PL-MarekNeural", name: "Marek", locale: "pl-PL", gender: "Male" },
          { id: "pl-PL-ZofiaNeural", name: "Zofia", locale: "pl-PL", gender: "Female" },
          { id: "en-US-AriaNeural", name: "Aria", locale: "en-US", gender: "Female" },
          { id: "en-US-GuyNeural", name: "Guy", locale: "en-US", gender: "Male" },
          { id: "en-GB-RyanNeural", name: "Ryan", locale: "en-GB", gender: "Male" },
        ]),
      synthesize: () => simulateJob("tts", "speech.mp3", { outPath: "C:\\speech.mp3", bytes: 1000 }),
      audio_url: () => ok(""),
      read_text: (path: string) => ok(`Text from ${path}`),
    },
    download: {
      probe: (url: string) => {
        const auto = { id: "bestvideo+bestaudio/best", kind: "auto", ext: "mp4", height: null, fps: null, vcodec: "auto", acodec: "auto", filesize: null, note: "" };
        const v = (id: string, height: number, size: number, fps = 30) => ({ id, kind: "video", ext: "mp4", height, fps, vcodec: "avc1.640028", acodec: "none", filesize: size, note: "" });
        const a = (id: string, abr: number, ext: string, size: number) => ({ id, kind: "audio", ext, height: null, fps: null, vcodec: "none", acodec: ext === "m4a" ? "mp4a.40.2" : "opus", filesize: size, abr, note: "" });
        const muxed = { id: "18", kind: "muxed", ext: "mp4", height: 360, fps: 30, vcodec: "avc1.42001E", acodec: "mp4a.40.2", filesize: 21_000_000, note: "" };
        return simulateJob("download.probe", url, {
          url,
          title: "Jak działa Media Studio – przegląd funkcji",
          uploader: "Demo Channel",
          duration: 754,
          viewCount: 128_400,
          thumbnail: fakePhoto(1),
          photoCount: url.includes("/photo/") ? 4 : 0,
          chapters: [
            { title: "Intro", start: 0, end: 62 },
            { title: "Setup", start: 62, end: 410 },
            { title: "Results", start: 410, end: 754 },
          ],
          ...(url.includes("list=")
            ? {
                isPlaylist: true,
                entries: Array.from({ length: 8 }, (_, i) => ({
                  url: `https://youtube.com/watch?v=demo${i + 1}`,
                  title: `Odcinek ${i + 1}`,
                  id: `demo${i + 1}`,
                  duration: 600 + i * 30,
                })),
              }
            : {}),
          formats: {
            video: [auto, v("401", 2160, 610_000_000, 60), v("137", 1080, 142_000_000), v("136", 720, 64_000_000), muxed],
            audio: [a("251", 160, "webm", 13_000_000), a("140", 129, "m4a", 12_100_000)],
            muxed: [auto, muxed],
          },
        }, 900);
      },
      start: () => simulateJob("download", "Demo video", { title: "Demo video", path: "", outdir: "C:\\Downloads" }),
      batch: (params?: { urls?: string[]; outdir?: string }) => {
        const urls = params?.urls?.filter((u) => u.trim()) ?? [
          "https://youtube.com/watch?v=demo1",
          "https://youtube.com/watch?v=demo2",
        ];
        return ok(simulateBatch(urls, params?.outdir || "C:\\Downloads"));
      },
      pending_queue: () =>
        ok(
          mockPendingQueue.length
            ? { urls: mockPendingQueue, options: { outdir: "C:\\Users\\demo\\Downloads", mode: "audio", audioCodec: "mp3", maxHeight: 0 } }
            : null,
        ),
      resume_queue: (): Promise<string> => {
        const urls = mockPendingQueue;
        mockPendingQueue = [];
        return backend.download.batch({ urls, outdir: "C:\\Users\\demo\\Downloads" });
      },
      discard_queue: () => {
        mockPendingQueue = [];
        return ok(true);
      },
      archive_count: () => ok(mockArchiveCount),
      clear_archive: () => {
        mockArchiveCount = 0;
        return ok(true);
      },
      add_to_batch: (params: { jobId?: string; urls: string[] }) => {
        const queue = params?.jobId ? mockQueues.get(params.jobId) : undefined;
        if (!queue || queue.closed) return ok({ success: false });
        for (const url of params.urls) {
          const index = queue.items.length;
          queue.items.push({ index, url, title: url, status: "pending", percent: 0 });
          queue.order.push(index);
          emit("job:partial", { jobId: params.jobId, data: { index, url, title: url, status: "pending" } });
        }
        return ok({ success: true });
      },
      reorder_batch: (params: { jobId: string; order: number[] }) => {
        const queue = mockQueues.get(params.jobId);
        if (!queue || queue.closed) return ok(false);
        const known = params.order.filter((index) => index >= 0 && index < queue.items.length);
        queue.order = [...known, ...queue.order.filter((index) => !known.includes(index))];
        reportBatch(params.jobId, queue);
        return ok(true);
      },
      skip_batch_item: (params: { jobId: string; index: number }) => {
        const queue = mockQueues.get(params.jobId);
        const item = queue?.items[params.index];
        if (!queue || queue.closed || !item || (item.status !== "pending" && item.status !== "running")) return ok(false);
        item.status = "cancelled";
        emit("job:partial", { jobId: params.jobId, data: { index: item.index, url: item.url, title: item.title, status: "cancelled" } });
        reportBatch(params.jobId, queue);
        return ok(true);
      },
      retry_failed: (jobId: string): Promise<string> => {
        const queue = mockQueues.get(jobId);
        const failed = queue?.items.filter((item) => item.status === "error") ?? [];
        if (!queue || failed.length === 0) return Promise.reject(new Error("errors.nothingToRetry"));
        if (queue.closed) {
          mockQueues.delete(jobId);
          return ok(simulateBatch(failed.map((item) => item.url.replace("fail", "ok")), queue.outdir));
        }
        for (const item of failed) {
          item.status = "pending";
          item.percent = 0;
          queue.order = [...queue.order.filter((index) => index !== item.index), item.index];
          emit("job:partial", { jobId, data: { index: item.index, url: item.url, title: item.title, status: "pending", error: null } });
        }
        return ok(jobId);
      },
    },
    watermark: {
      load: (path: string) => ok({ path, width: 1280, height: 800, dataUrl: fakePhoto(0) }),
      lama_available: () => ok(false),
      remove: () => simulateJob("watermark", "image.png", { resultPath: "C:\\cache\\result.png", dataUrl: fakePhoto(2), notice: null }, 1200),
      save: (_r: string, out: string) => ok(out),
    },
    instagram: {
      stop: () => ok(true),
      probe: (url: string) => {
        const profile = !/\/(p|reels?|stories)\//.test(url);
        return simulateJob("instagram.probe", url, {
          url,
          kind: profile ? "profile" : url.includes("/stories/") ? "stories" : "post",
          uploader: "demo.account",
          items: Array.from({ length: profile ? 18 : 4 }, (_, index) => ({
            index,
            key: `demo.account_DemoPost${index + 1}`,
            kind: index % 4 === 1 ? "video" : profile && index % 3 === 0 ? "carousel" : "image",
            count: profile && index % 3 === 0 ? 5 : 1,
            width: 1080,
            height: 1350,
            duration: index % 4 === 1 ? 14.5 : null,
            thumbnail: fakePhoto(index + 2),
            selected: true,
          })),
        }, 900);
      },
      start: (params?: { outdir?: string; keys?: string[] }) => {
        const outdir = params?.outdir || "C:\\Downloads";
        const keys = params?.keys ?? ["demo.account_DemoPost1"];
        const files = keys.map((key) => `${outdir}\\${key}.jpg`);
        return simulateJob("instagram", "DemoPost123", { files, keys, failed: 0, size: 2_400_000, duration: 2.1, outdir });
      },
    },
    progress: {
      load_banner: () => ok(""),
      save: (_d: string, outPath: string) => ok({ outPath, bytes: 0 }),
    },
    upscale: {
      load: (path: string) => ok({ path, width: 800, height: 600, hasAlpha: true, dataUrl: fakePhoto(0) }),
      models_status: () => ok({ general: true, anime: false }),
      start: (_params: { path: string; scale?: number }) =>
        simulateJob("upscale", "image.png (4x)", {
          resultPath: "C:\\cache\\upscaled.png",
          width: 3200,
          height: 2400,
          hasAlpha: true,
          dataUrl: fakePhoto(1),
        }, 1500),
      save: (_r: string, out: string) => ok(out),
    },
    rembg: {
      load: (path: string) => ok({ path, width: 800, height: 600, dataUrl: fakePhoto(0) }),
      is_available: () => ok(false),
      remove: () =>
        simulateJob("rembg", "image.png", {
          resultPath: "C:\\cache\\rembg_result.png",
          width: 800,
          height: 600,
          dataUrl: fakePhoto(2),
          elapsed: 1.2,
        }, 1500),
      save: (_r: string, out: string) => ok(out),
    },
    compressor: {
      load_preview: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "image.png",
          size: 3_500_000,
          width: 1920,
          height: 1080,
          format: "PNG",
          hasAlpha: false,
          dataUrl: fakePhoto(0),
        }),
      preview: (_path: string, _params: unknown) =>
        ok({
          compressedBytes: 650_000,
          savedBytes: 2_850_000,
          savedPercent: 81.4,
          dataUrl: fakePhoto(1),
        }),
      start: (params: { files?: string[]; path?: string; outPath?: string; outputDir?: string }) => {
        const files = params.files ?? (params.path ? [params.path] : []);
        const outputDir = params.outputDir ?? "C:\\out";
        const results = files.map((file) => ({
          file,
          dest: params.outPath ?? `${outputDir}\\${file.split("\\").pop()}`,
          inBytes: 3_500_000,
          outBytes: 650_000,
          savedPercent: 81.4,
        }));
        return simulateJob("compressor", files.length === 1 ? files[0].split("\\").pop() ?? "" : `${files.length} files`, {
          total: files.length,
          processed: files.length,
          failed: 0,
          inBytes: 3_500_000 * files.length,
          outBytes: 650_000 * files.length,
          savedBytes: 2_850_000 * files.length,
          savedPercent: 81.4,
          outputDir,
          outPath: files.length === 1 ? params.outPath : undefined,
          files: results.map((r) => r.dest),
          results,
        }, 1200);
      },
    },
    image_editor: {
      thumbnail: (_path: string) => ok({ width: 1920, height: 1080, format: "PNG", size: 2_400_000, dataUrl: fakePhoto(0) }),
      sizes: (paths: string[]) => ok(paths.map(() => ({ width: 1920, height: 1080 }))),
      load_preview: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "photo.png",
          size: 2_400_000,
          width: 1920,
          height: 1080,
          format: "PNG",
          hasAlpha: false,
          dataUrl: fakePhoto(0),
        }),
      preview_transform: (_path: string, _ops: unknown) =>
        ok({
          width: 1280,
          height: 720,
          hasAlpha: false,
          dataUrl: fakePhoto(1),
        }),
      save_transformed: (_src: string, target: string, _ops: unknown) =>
        ok({
          outPath: target,
          width: 1280,
          height: 720,
          bytes: 1_200_000,
        }),
      start_batch: (files: string[], outDir: string, _ops: unknown) => {
        const results = files.map((file) => ({
          file,
          dest: `${outDir}\\${file.split("\\").pop()}`,
          width: 1280,
          height: 720,
          bytes: 640_000,
        }));
        return simulateJob("image_editor", `${files.length} files`, {
          total: files.length,
          processed: files.length,
          failed: 0,
          outputDir: outDir,
          files: results.map((r) => r.dest),
          results,
        }, 1200);
      },
    },
    video_sync: {
      probe: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "clip.mp4",
          size: 45_000_000,
          format: "mp4",
          duration: 184.5,
          hasVideo: true,
          hasAudio: true,
          width: 1920,
          height: 1080,
          fps: 60.0,
          videoCodec: "h264",
          audioTracks: [
            {
              index: 1,
              streamIndex: 1,
              codec: "aac",
              channels: 2,
              sampleRate: 48000,
              bitrate: 192000,
              title: "Stereo Master",
              language: "eng",
            },
          ],
          thumbnail: fakePhoto(2),
        }),
      waveform: (_path: string, points = 1200, startSec = 0, duration = 30) => {
        const pts: number[] = [];
        for (let i = 0; i < points; i++) {
          const t = i / points;
          const beat = Math.sin(t * 50) * 0.4 + Math.sin(t * 12) * 0.3;
          pts.push(Math.max(0.05, Math.min(1.0, Math.abs(beat) + Math.random() * 0.2)));
        }
        return ok({
          points: pts,
          sampleCount: points * 10,
          duration,
          startSec,
          maxPeak: 0.95,
        });
      },
      frames: (_path: string, startSec: number, duration: number, count: number) =>
        ok({
          frames: Array.from({ length: count }, (_, i) => {
            const time = startSec + ((i + 0.5) * duration) / count;
            return { time, dataUrl: fakePhoto(Math.floor(time / 20)) };
          }),
        }),
      preview: (params: { videoPath: string; offsetSec: number; startSec?: number; duration?: number }) =>
        ok({
          previewUrl: "",
          duration: params.duration || 30,
          offsetSec: params.offsetSec,
          startSec: params.startSec || 0,
          sizeBytes: 1_500_000,
        }),
      start: (params: { outputPath: string; offsetSec: number }) =>
        simulateJob("video_sync", "Audio-Video Sync", {
          outputPath: params.outputPath,
          fileName: params.outputPath.split(/[\\/]/).pop() || "synced.mp4",
          bytes: 45_200_000,
          offsetSec: params.offsetSec,
        }, 1500),
    },
    media_convert: {
      probe: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "clip.mp4",
          size: 18_000_000,
          format: "mp4",
          duration: 42.5,
          hasVideo: !/\.(mp3|wav|m4a|flac|ogg|opus|aac)$/i.test(path),
          hasAudio: true,
          width: 1280,
          height: 720,
          fps: 30,
          videoCodec: "h264",
          audioTracks: [],
          thumbnail: fakePhoto(3),
        }),
      frames: (_path: string, startSec: number, duration: number, count: number) =>
        ok({
          frames: Array.from({ length: count }, (_, i) => {
            const time = startSec + ((i + 0.5) * duration) / count;
            return { time, dataUrl: fakePhoto(Math.floor(time / 5)) };
          }),
        }),
      start: (params: { paths: string[]; outputDir: string; format: string }) => {
        const files = params.paths.map((p) => `${params.outputDir}\\${(p.split(/[\\/]/).pop() || "clip").replace(/\.[^.]+$/, "")}.${params.format}`);
        return simulateJob(
          "media_convert",
          params.paths.length === 1 ? params.paths[0].split(/[\\/]/).pop() || "clip" : `${params.paths.length} files`,
          {
            total: files.length,
            converted: files.length,
            failed: 0,
            inBytes: files.length * 18_000_000,
            outBytes: files.length * 7_400_000,
            outputDir: params.outputDir,
            outPath: files.length === 1 ? files[0] : null,
            files,
            results: files.map((dest, i) => ({ file: params.paths[i], dest, inBytes: 18_000_000, outBytes: 7_400_000 })),
          },
          2200,
        );
      },
    },
    video_to_gif: {
      probe: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "clip.mp4",
          size: 18_000_000,
          format: "mp4",
          duration: 42.5,
          hasVideo: true,
          hasAudio: true,
          width: 1280,
          height: 720,
          fps: 30,
          videoCodec: "h264",
          audioTracks: [],
          thumbnail: fakePhoto(3),
          gifsicle: false,
        }),
      frames: (_path: string, startSec: number, duration: number, count: number) =>
        ok({
          frames: Array.from({ length: count }, (_, i) => {
            const time = startSec + ((i + 0.5) * duration) / count;
            return { time, dataUrl: fakePhoto(Math.floor(time / 5)) };
          }),
        }),
      preview: (params: { start: number; end: number; speed: number; fps: number }) => {
        const seconds = (params.end - params.start) / params.speed;
        const shown = Math.min(5, seconds);
        const size = Math.round(shown * params.fps * 18_000);
        return ok({ dataUrl: fakePhoto(4), size, previewSeconds: shown, estimatedSize: Math.round((size * seconds) / shown) });
      },
      start: (params: { outPath: string; start: number; end: number; speed: number; fps: number; width: number }) => {
        const duration = (params.end - params.start) / params.speed;
        const width = params.width || 1280;
        return simulateJob("video_to_gif.render", params.outPath.split(/[\\/]/).pop() || "clip.gif", {
          outPath: params.outPath,
          size: Math.round(duration * params.fps * 18_000),
          width,
          height: Math.round((width * 9) / 16),
          frames: Math.round(duration * params.fps),
          duration,
          fit: null,
        }, 1800);
      },
    },
    transcribe: {
      models: () =>
        ok([
          { id: "base", depId: "whisper_base", size: 147_880_741, ready: false, translate: true },
          { id: "small", depId: "whisper_small", size: 486_212_372, ready: true, translate: true },
          { id: "turbo", depId: "whisper_turbo", size: 1_621_665_983, ready: false, translate: false },
        ]),
      probe: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "talk.mp4",
          size: 18_000_000,
          format: "mp4",
          duration: 95.4,
          hasVideo: true,
          hasAudio: true,
          width: 1280,
          height: 720,
          fps: 30,
          videoCodec: "h264",
          audioTracks: [],
          thumbnail: fakePhoto(5),
        }),
      start: (params: { path: string; outPath: string; format: string }) =>
        simulateJob("transcribe", params.path.split(/[\\/]/).pop() || "talk.mp4", {
          outPath: params.outPath,
          format: params.format,
          language: "pl",
          duration: 95.4,
          elapsed: 31.2,
          segments: [
            { start: 0, end: 2.4, text: "Dzień dobry, witam wszystkich." },
            { start: 2.9, end: 7.8, text: "Dzisiaj pokażę, jak zrobić napisy do filmu w kilka minut." },
            { start: 8.4, end: 12.1, text: "Zaczynamy od wybrania pliku." },
          ],
        }, 2500),
    },
    gif_editor: {
      load: (path: string) =>
        ok({
          path,
          fileName: path.split(/[\\/]/).pop() || "anim.gif",
          size: 3_400_000,
          width: 480,
          height: 270,
          frames: 48,
          duration: 4.8,
          plays: 0,
          format: "gif",
          dataUrl: fakePhoto(path.length),
          gifsicle: false,
        }),
      frames: (_path: string, startSec: number, duration: number, count: number) =>
        ok({
          frames: Array.from({ length: count }, (_, i) => {
            const time = startSec + ((i + 0.5) * duration) / count;
            return { time, dataUrl: fakePhoto(Math.floor(time)) };
          }),
        }),
      preview: (path: string) =>
        ok({ width: 480, height: 270, frames: 48, duration: 4.8, size: 1_900_000, fit: null, dataUrl: fakePhoto(path.length + 1) }),
      start: (params: { path?: string; outPath?: string; files?: string[]; outputDir?: string }) => {
        const files = params.files ?? (params.path ? [params.path] : []);
        const results = files.map((file, i) => ({
          file,
          dest: params.outPath ?? `${params.outputDir}\\${file.split(/[\\/]/).pop()}`,
          width: 480,
          height: 270,
          frames: 48,
          duration: 4.8,
          size: 1_900_000 - i * 100_000,
          originalSize: 3_400_000,
          savedPercent: 44.1 + i,
          fit: null,
        }));
        const title = files.length === 1 ? files[0].split(/[\\/]/).pop() || "" : `${files.length} files`;
        return simulateJob("gif_editor.render", title, {
          total: files.length,
          processed: files.length,
          failed: 0,
          inBytes: 3_400_000 * files.length,
          outBytes: results.reduce((sum, r) => sum + r.size, 0),
          savedPercent: 44.1,
          outPath: results[0]?.dest ?? "",
          outputDir: params.outputDir ?? "",
          files: results.map((r) => r.dest),
          results,
        }, 1800);
      },
    },
  };
  return backend;
}

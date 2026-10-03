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
      open_files: (types: string[] = []) =>
        ok(
          types.some((t) => t.toLowerCase().includes("pdf"))
            ? ["C:\\Users\\demo\\Documents\\raport.pdf", "C:\\Users\\demo\\Documents\\umowa.pdf"]
            : ["C:\\Users\\demo\\Pictures\\photo.png"],
        ),
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
        return simulateJob("pdf.inspect", "", { pages, errors: [] }, 800);
      },
      render_page: (_path: string, page: number) => ok(fakePageThumb(0, page)),
      merge: () => simulateJob("pdf.merge", "merged.pdf", { outPath: "C:\\merged.pdf", pageCount: 3, bytes: 1000 }),
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
      audio_data_url: () => ok(""),
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
          formats: {
            video: [auto, v("401", 2160, 610_000_000, 60), v("137", 1080, 142_000_000), v("136", 720, 64_000_000), muxed],
            audio: [a("251", 160, "webm", 13_000_000), a("140", 129, "m4a", 12_100_000)],
            muxed: [auto, muxed],
          },
        }, 900);
      },
      start: () => simulateJob("download", "Demo video", { title: "Demo video", path: "", outdir: "C:\\Downloads" }),
      batch: () => simulateJob("download.batch", "2 URL", { items: [], succeeded: 2, failed: 0, outdir: "C:\\Downloads" }),
    },
    watermark: {
      load: (path: string) => ok({ path, width: 1280, height: 800, dataUrl: fakePhoto(0) }),
      lama_available: () => ok(false),
      remove: () => simulateJob("watermark", "image.png", { resultPath: "C:\\cache\\result.png", dataUrl: fakePhoto(2), notice: null }, 1200),
      save: (_r: string, out: string) => ok(out),
    },
    progress: {
      load_banner: () => ok(""),
      save: (_d: string, outPath: string) => ok({ outPath, bytes: 0 }),
    },
  };
}

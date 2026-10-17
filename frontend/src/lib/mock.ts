// In-browser stand-in for the Python backend, used when the UI runs outside pywebview
// (e.g. `npm run dev` opened in a normal browser). Data is fake; jobs are simulated.

import type { Settings } from "./types";

type Emit = (event: string, payload: unknown) => void;

const SETTINGS_KEY = "mock-settings";
const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "pl",
  mica: false,
  outputDir: "C:\\Users\\demo\\Downloads",
  cookies: { youtube: "", x: "" },
  recentFolders: ["C:\\Users\\demo\\Pictures", "C:\\Users\\demo\\Videos"],
  hardwareAcceleration: true,
  maxConcurrency: 4,
  desktopNotifications: true,
  completionSound: true,
  customFfmpegPath: "",
  confirmExitOnActiveJobs: true,
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
      ready: () => ok({ name: "Media Studio", version: "dev-mock", python: "—", platform: navigator.userAgent }),
      info: () => ok({ name: "Media Studio", version: "dev-mock", python: "—", platform: navigator.userAgent }),
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
      clear_recent_folders: () => {
        settings = { ...settings, recentFolders: [] };
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
          { id: "ffmpeg", ok: true, detail: "C:\\ffmpeg\\bin\\ffmpeg.exe", usedBy: ["download", "tts"], required: true, installable: false, sizeEstimate: "" },
          { id: "mediainfo", ok: true, detail: "", usedBy: ["duplicates"], required: true, installable: false, sizeEstimate: "" },
          { id: "lama", ok: false, detail: "settings.deps.detailLamaModelOnly", usedBy: ["watermark"], required: false, installable: true, sizeEstimate: "~196 MB" },
        ]),
      install_dependency: (id: string) =>
        simulateJob(id === "lama" ? "watermark.install" : "download.install", id, { id, ok: true }, 2500),
      storage_info: () =>
        ok({
          appDataDir: "C:\\Users\\demo\\AppData\\Roaming\\MediaStudio",
          cacheDir: "C:\\Users\\demo\\AppData\\Roaming\\MediaStudio\\cache",
          modelsDir: "C:\\Users\\demo\\AppData\\Roaming\\MediaStudio\\models",
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
      compress: (path: string, outPath: string) =>
        simulateJob("pdf.compress", "compressed.pdf", { inPath: path, outPath, inBytes: 15_000_000, outBytes: 2_400_000, savedBytes: 12_600_000, savedPercent: 84.0 }),
      split: (_path: string, outDir: string) =>
        simulateJob("pdf.split", "split", { files: [`${outDir}\\strona_001.pdf`, `${outDir}\\strona_002.pdf`], count: 2, outDir }),
      pdf_to_images: (_path: string, outDir: string) =>
        simulateJob("pdf.to_images", "images", { files: [`${outDir}\\page_001.png`, `${outDir}\\page_002.png`], count: 2, outDir }),
      images_to_pdf: (_paths: string[], outPath: string) =>
        simulateJob("pdf.from_images", "doc.pdf", { outPath, pageCount: 2, bytes: 500_000 }),
      rotate_pages: (_path: string, _pages: number[], _angle: number, outPath: string) =>
        simulateJob("pdf.rotate", "rotated.pdf", { outPath, rotatedCount: 1, bytes: 200_000 }),
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
      batch: (params?: { urls?: string[]; outdir?: string }) => {
        const urls = params?.urls?.filter((u) => u.trim()) ?? [
          "https://youtube.com/watch?v=demo1",
          "https://youtube.com/watch?v=demo2",
        ];
        const total = urls.length;
        const jobId = `mock${++counter}`;
        const started = Date.now();
        const durationMs = 4500;
        emit("job:started", {
          id: jobId,
          kind: "download.batch",
          title: `${total} URL`,
          status: "running",
          startedAt: started / 1000,
          finishedAt: null,
          error: null,
          percent: 0,
          message: null,
          params: {},
        });
        urls.forEach((url, i) => {
          emit("job:partial", { jobId, data: { index: i, url, status: "pending" } });
        });
        const timer = window.setInterval(() => {
          const elapsed = Date.now() - started;
          const overallPercent = Math.min(100, (elapsed / durationMs) * 100);
          const currentItem = Math.min(total - 1, Math.floor((overallPercent / 100) * total));
          const itemPercent = Math.min(100, ((overallPercent % (100 / total)) / (100 / total)) * 100);

          for (let i = 0; i < currentItem; i++) {
            emit("job:partial", { jobId, data: { index: i, url: urls[i], status: "done", title: `Film #${i + 1}` } });
          }
          emit("job:partial", {
            jobId,
            data: { index: currentItem, url: urls[currentItem], status: "running", title: `Film #${currentItem + 1}` },
          });

          emit("job:progress", {
            jobId,
            percent: overallPercent,
            message: "download.status.downloading",
            params: {},
            item: currentItem,
            itemPercent,
            speed: 5_200_000,
            eta: Math.max(0, Math.round((durationMs - elapsed) / 1000)),
          });

          if (overallPercent >= 100) {
            window.clearInterval(timer);
            running.delete(jobId);
            const items = urls.map((u, i) => ({
              index: i,
              url: u,
              status: "done",
              title: `Film #${i + 1}`,
              size: 24_500_000 + i * 5_000_000,
              duration: 2.5,
            }));
            const totalSize = items.reduce((acc, it) => acc + it.size, 0);
            emit("job:done", {
              jobId,
              result: { items, succeeded: total, failed: 0, totalSize, totalDuration: 4.5, outdir: params?.outdir || "C:\\Downloads" },
            });
          }
        }, 150);
        running.set(jobId, timer);
        return Promise.resolve(jobId);
      },
      add_to_batch: (params: { jobId?: string; urls: string[] }) => {
        const newUrls = params?.urls || [];
        newUrls.forEach((u, i) => {
          emit("job:partial", {
            jobId: params?.jobId || "mock",
            data: { index: 100 + i, url: u, status: "pending", title: u },
          });
        });
        return ok({ success: true });
      },
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
      start: (_params: unknown) =>
        simulateJob("compressor", "image.png", {
          total: 1,
          processed: 1,
          failed: 0,
          inBytes: 3_500_000,
          outBytes: 650_000,
          savedBytes: 2_850_000,
          savedPercent: 81.4,
          outputDir: "C:\\out",
        }, 1200),
    },
    image_editor: {
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
      start_batch: (_files: string[], outDir: string, _ops: unknown) =>
        simulateJob("image_editor", "Batch transforms", {
          total: 2,
          processed: 2,
          failed: 0,
          outputDir: outDir,
          results: [],
        }, 1200),
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
  };
}

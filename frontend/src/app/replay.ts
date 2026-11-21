// "Open with these settings": puts the bridge call a job was started with back into its tool's form.

import { useCompressorForm, type CompressMode } from "../features/compressor/store";
import { FORMATS as IMAGE_FORMATS, INPUT_FORMATS, useConverterForm } from "../features/converter/store";
import { useDownloadForm } from "../features/download/store";
import { editsFromOperations, useGifEditorForm, useVideoToGifForm } from "../features/gif/store";
import { setGifOutput } from "../features/gif/useGifOutput";
import { useInstagramForm } from "../features/instagram/store";
import { BITRATES, HEIGHTS, QUALITIES, useMediaConvertForm, AUDIO_FORMATS, VIDEO_FORMATS } from "../features/media_convert/store";
import { useOcrForm } from "../features/ocr/store";
import {
  FIRST_GROUP,
  PDF_IMAGE_FORMATS,
  usePdfCompressForm,
  usePdfConvertForm,
  usePdfExtractForm,
  usePdfMergeForm,
  usePdfSplitForm,
  type MergePage,
} from "../features/pdf/store";
import { useRemBgForm } from "../features/rembg/store";
import { useTranscribeForm } from "../features/transcribe/store";
import { FORMATS as AUDIO_OUTPUTS, useTtsForm } from "../features/tts/store";
import { useUpscaleForm } from "../features/upscale/store";
import { useVideoSyncForm } from "../features/video_sync/store";
import { api } from "../lib/bridge";
import { dirName, fileName, formatDuration } from "../lib/format";
import { navigate } from "../lib/router";
import type { GifOperations, GifOutputOptions, JobReplay } from "../lib/types";
import { useSettings } from "../stores/settings";

type Params = Record<string, unknown>;

const params = (value: unknown): Params =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Params) : {};
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const texts = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const pick = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T =>
  choices.find((choice) => choice === value) ?? fallback;
const stem = (path: string) => fileName(path).replace(/\.[^.]+$/, "");
const extension = (path: string) => fileName(path).match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";

function gifOutput(value: unknown): Partial<GifOutputOptions> {
  const o = params(value);
  return {
    format: pick(o.format, ["gif", "webp", "apng", "mp4"] as const, "gif"),
    lossy: num(o.lossy, 0),
    colors: num(o.colors, 256),
    dither: o.dither !== false,
    plays: num(o.plays, 0),
    quality: num(o.quality, 80),
    targetBytes: num(o.targetBytes, 0),
  };
}

const gifOperations = (value: unknown): GifOperations => params(value) as GifOperations;

const cropRect = (value: unknown) => {
  const c = params(value);
  return typeof c.width === "number" && typeof c.height === "number"
    ? { x: num(c.x, 0), y: num(c.y, 0), w: c.width, h: c.height }
    : null;
};

interface Target {
  tool: string;
  /** Fills the tool's form from the call's arguments; may read the files again (probes, previews). */
  open: (args: unknown[]) => void | Promise<void>;
}

const TARGETS: Record<string, Target> = {
  "converter.start": {
    tool: "converter",
    open: ([options]) => {
      const o = params(options);
      const inputDir = text(o.inputDir);
      useConverterForm.getState().set({
        source: inputDir ? "folder" : "files",
        inputDir,
        files: texts(o.files),
        inFormat: pick(o.inFormat, INPUT_FORMATS, "PNG"),
        outFormat: pick(o.outFormat, IMAGE_FORMATS, "WEBP"),
        outputDir: text(o.outputDir),
        quality: num(o.quality, 80),
        method: num(o.method, 6),
      });
    },
  },
  "media_convert.start": {
    tool: "media_convert",
    open: ([options]) => {
      const o = params(options);
      const start = num(o.start, 0);
      const end = num(o.end, 0);
      const targetMb = num(o.targetMb, 0);
      useMediaConvertForm.getState().set({
        files: texts(o.paths),
        format: pick(o.format, [...VIDEO_FORMATS, ...AUDIO_FORMATS], "mp4"),
        codec: pick(o.codec, ["h264", "hevc", "av1", "vp9"] as const, "h264"),
        sizeMode: o.copy === true ? "copy" : targetMb > 0 ? "size" : "quality",
        quality: pick(o.quality, QUALITIES, "balanced"),
        ...(targetMb > 0 ? { targetMb } : {}),
        height: pick(String(num(o.height, 0)), HEIGHTS, "0"),
        mute: o.mute === true,
        audioKbps: pick(String(num(o.audioKbps, 192)), BITRATES, "192"),
        normalize: o.normalize === true,
        range: end > start ? { start, end } : null,
        outputDir: text(o.outputDir),
      });
    },
  },
  "compressor.start": {
    tool: "compressor",
    open: ([options]) => {
      const o = params(options);
      const path = text(o.path);
      useCompressorForm.getState().set({
        files: o.files ? texts(o.files) : path ? [path] : [],
        selected: 0,
        mode: pick<CompressMode>(o.mode, ["smart", "lossless", "target"], "smart"),
        format: pick(o.format, ["original", "png", "jpeg", "webp"] as const, "original"),
        quality: num(o.quality, 80),
        targetKb: String(num(o.targetKb, 500)),
        outputDir: text(o.outputDir, dirName(text(o.outPath))),
      });
    },
  },
  "pdf.merge": {
    tool: "pdf",
    open: ([pages, outPath]) => {
      const selection: MergePage[] = (Array.isArray(pages) ? pages : []).map(params).flatMap((p) => {
        const file = text(p.file);
        return file ? [{ file, page: num(p.page, 0), rotation: num(p.rotation, 0) }] : [];
      });
      const form = usePdfMergeForm.getState();
      form.setPages([]);
      form.setOutputDir(dirName(text(outPath)));
      form.setOutputName(stem(text(outPath)));
      form.setRestore(selection.length ? selection : null);
    },
  },
  "pdf.compress": {
    tool: "pdf_compress",
    open: ([path, outPath, quality]) =>
      usePdfCompressForm.getState().set({
        file: text(path) || null,
        preset: pick(quality, ["low", "balanced", "high"] as const, "balanced"),
        outputDir: dirName(text(outPath)),
      }),
  },
  "pdf.split": {
    tool: "pdf_split",
    open: ([path, outDir, mode, groups]) => {
      const pages = Array.isArray(groups) ? groups.map((g) => (Array.isArray(g) ? g.filter((n): n is number => typeof n === "number") : [])) : [];
      usePdfSplitForm.getState().set({
        file: text(path) || null,
        mode: pick(mode, ["all", "groups"] as const, "all"),
        groups: pages.length ? pages.map((group, color) => ({ color, pages: group })) : FIRST_GROUP,
        active: 0,
        lastPage: null,
        outputDir: text(outDir),
      });
    },
  },
  "pdf.pdf_to_images": {
    tool: "pdf_convert",
    open: ([path, outDir, fmt, dpi, rangeSpec]) =>
      usePdfConvertForm.getState().set({
        subTab: "pdfToImages",
        pdfFile: text(path) || null,
        format: pick(fmt, PDF_IMAGE_FORMATS, "png"),
        dpi: num(dpi, 150),
        pageRange: text(rangeSpec),
        outputDir: text(outDir),
      }),
  },
  "pdf.images_to_pdf": {
    tool: "pdf_convert",
    open: ([paths, outPath]) =>
      usePdfConvertForm.getState().set({
        subTab: "imagesToPdf",
        imageFiles: texts(paths),
        outputDir: dirName(text(outPath)),
        pdfName: stem(text(outPath)),
      }),
  },
  "pdf.extract_text": {
    tool: "pdf_extract",
    open: ([path, outPath]) => usePdfExtractForm.getState().set({ file: text(path) || null, outputDir: dirName(text(outPath)) }),
  },
  "tts.synthesize": {
    tool: "tts",
    open: ([options]) => {
      const o = params(options);
      const form = useTtsForm.getState();
      const engine = pick(o.engine, ["edge", "pyttsx3"] as const, "edge");
      const outPath = text(o.outPath);
      form.set({
        text: text(o.text),
        engine,
        voice: text(o.voice),
        locale: "",
        rate: { ...form.rate, [engine]: num(o.rate, form.rate[engine]) },
        format: pick(extension(outPath), AUDIO_OUTPUTS, "mp3"),
        outDir: dirName(outPath),
        fileName: stem(outPath),
        audioSrc: null,
        lastOutput: null,
      });
    },
  },
  "video_to_gif.start": {
    tool: "video_to_gif",
    open: async ([options]) => {
      const o = params(options);
      const video = await api.video_to_gif.probe(text(o.path));
      const start = num(o.start, 0);
      useVideoToGifForm.getState().set({
        video,
        range: { start, end: Math.max(start, num(o.end, video.duration)) },
        fps: num(o.fps, 12),
        width: num(o.width, 0),
        speed: num(o.speed, 1),
        reverse: o.reverse === true,
        crop: cropRect(o.crop),
        outputDir: dirName(text(o.outPath)),
      });
      setGifOutput("video_to_gif", gifOutput(o.output));
    },
  },
  "gif_editor.start": {
    tool: "gif_editor",
    open: ([options]) => {
      const o = params(options);
      const perFile = params(o.operations);
      const files = o.files ? texts(o.files) : [text(o.path)].filter(Boolean);
      useGifEditorForm.getState().set({
        files,
        selected: 0,
        editsByFile: Object.fromEntries(
          files.map((file) => [file, editsFromOperations(gifOperations(o.files ? perFile[file] : o.operations))]),
        ),
        outputDir: text(o.outputDir, dirName(text(o.outPath))),
      });
      setGifOutput("gif_editor", gifOutput(o.output));
    },
  },
  "video_sync.start": {
    tool: "video_sync",
    open: async ([options]) => {
      const o = params(options);
      const audioPath = text(o.audioPath);
      const [video, externalAudio] = await Promise.all([
        api.video_sync.probe(text(o.videoPath)),
        audioPath ? api.video_sync.probe(audioPath) : Promise.resolve(null),
      ]);
      const trackIndex = audioPath ? 0 : num(o.audioTrackIndex, 0);
      const outputPath = text(o.outputPath);
      useVideoSyncForm.getState().set({
        video,
        externalAudio,
        externalWave: null,
        source: externalAudio ? "external" : trackIndex,
        trackIndex,
        offsetSec: num(o.offsetSec, 0),
        previewStartSec: 0,
        previewClip: null,
        outputDir: dirName(outputPath),
        outputName: fileName(outputPath),
        exportMode: pick(o.mode, ["fast_copy", "reencode"] as const, "fast_copy"),
      });
    },
  },
  "transcribe.start": {
    tool: "transcribe",
    open: async ([options]) => {
      const o = params(options);
      const media = await api.transcribe.probe(text(o.path));
      useTranscribeForm.getState().set({
        media,
        options: {
          model: pick(o.model, ["base", "small", "turbo"] as const, "small"),
          language: text(o.language),
          format: pick(o.format, ["srt", "vtt", "txt"] as const, "srt"),
          translate: o.translate === true,
        },
        outputDir: dirName(text(o.outPath)),
      });
    },
  },
  "upscale.start": {
    tool: "upscale",
    open: ([options]) => {
      const o = params(options);
      useUpscaleForm.getState().set({
        sourcePath: text(o.path),
        image: null,
        result: null,
        model: pick(o.model, ["general", "anime"] as const, "general"),
        scale: o.scale === 2 ? 2 : 4,
        alphaMode: pick(o.alphaMode, ["smooth", "ai"] as const, "smooth"),
        antiHalo: o.antiHalo !== false,
      });
    },
  },
  "rembg.remove": {
    tool: "rembg",
    open: ([options]) => {
      const o = params(options);
      useRemBgForm.getState().set({
        sourcePath: text(o.path),
        image: null,
        result: null,
        model: pick(o.model, ["birefnet", "birefnet-lite", "isnet", "u2net"] as const, "birefnet"),
        antiHalo: o.antiHalo !== false,
        choke: num(o.choke, 1),
        feather: num(o.feather, 0),
        despeckle: o.despeckle !== false,
      });
    },
  },
  "download.start": {
    tool: "download",
    open: ([options]) => {
      const o = params(options);
      const section = params(o.section);
      const clip = typeof section.end === "number";
      const form = useDownloadForm.getState();
      form.set({
        tab: "single",
        url: text(o.url),
        probe: null,
        mode: pick(o.mode, ["video", "audio", "muxed"] as const, "video"),
        audioCodec: text(o.audioCodec, form.audioCodec),
        outdir: text(o.outdir),
        template: text(o.template, form.template),
        sponsorblock: o.sponsorblock === true,
        clip,
        clipStart: clip ? formatDuration(num(section.start, 0)) : "",
        clipEnd: clip ? formatDuration(num(section.end, 0)) : "",
        autoProbe: true,
      });
    },
  },
  "download.batch": {
    tool: "download",
    open: ([options]) => {
      const o = params(options);
      const form = useDownloadForm.getState();
      form.set({
        tab: "batch",
        batchText: texts(o.urls).join("\n"),
        batchMode: pick(o.mode, ["video", "audio"] as const, "video"),
        audioCodec: text(o.audioCodec, form.audioCodec),
        maxHeight: num(o.maxHeight, 0),
        outdir: text(o.outdir),
        template: text(o.template, form.template),
        sponsorblock: o.sponsorblock === true,
        lastBatch: null,
      });
    },
  },
  "instagram.start": {
    tool: "instagram",
    open: ([options]) => {
      const o = params(options);
      useInstagramForm.getState().set({ url: text(o.url), outdir: text(o.outdir), post: null, selected: [], result: null, autoProbe: true });
    },
  },
  "ocr.images": {
    tool: "ocr",
    open: ([options]) => {
      const o = params(options);
      useOcrForm.getState().set({ sources: texts(o.paths), text: "" });
      rememberOcrLanguage(o.language);
    },
  },
  "ocr.pdf": {
    tool: "ocr",
    open: ([options]) => {
      const o = params(options);
      const outPath = text(o.outPath);
      useOcrForm.getState().set({
        sources: [text(o.path)].filter(Boolean),
        text: "",
        searchablePdf: !!outPath,
        ...(outPath ? { outputDir: dirName(outPath) } : {}),
      });
      rememberOcrLanguage(o.language);
    },
  },
};

/** The OCR tool keeps its language as a setting, so opening a job with another language changes it there. */
function rememberOcrLanguage(language: unknown) {
  const tag = text(language);
  if (tag) useSettings.getState().update({ ocrLanguage: tag }).catch(() => undefined);
}

/** The tool a saved call opens in, or null when its settings cannot be put back into a form. */
export const replayTool = (replay: JobReplay | undefined): string | null => (replay && TARGETS[replay.method]?.tool) || null;

/** Fills the tool's form from `replay` and opens the tool. Rejects when the files cannot be read again. */
export async function openWithSettings(replay: JobReplay): Promise<void> {
  const target = TARGETS[replay.method];
  if (!target) return;
  await target.open(Array.isArray(replay.args) ? replay.args : []);
  navigate(target.tool);
}

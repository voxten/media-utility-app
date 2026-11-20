// What a finished job produced, in a few short parts for the job card ("1080p · MP4 · 9:56 · 48 MB").

import type { TFunction } from "i18next";
import { formatBytes, formatDuration } from "./format";

type Result = Record<string, unknown>;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const positive = (value: unknown): number | undefined => {
  const n = num(value);
  return n != null && n > 0 ? n : undefined;
};

const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

const bytes = (value: unknown) => {
  const n = positive(value);
  return n == null ? undefined : formatBytes(n);
};

const dimensions = (r: Result) => {
  const w = positive(r.width);
  const h = positive(r.height);
  return w != null && h != null ? `${w}×${h}` : undefined;
};

/** "1.2 MB → 312 KB (−74%)"; the percent is worked out from the sizes when the result has none. */
export function sizeChange(before: unknown, after: unknown, savedPercent?: unknown): string | undefined {
  const a = positive(before);
  const b = positive(after);
  if (a == null || b == null) return undefined;
  const saved = num(savedPercent) ?? (1 - b / a) * 100;
  const rounded = Math.round(saved);
  const pct = rounded === 0 ? "" : ` (${rounded > 0 ? "−" : "+"}${Math.abs(rounded)}%)`;
  return `${formatBytes(a)} → ${formatBytes(b)}${pct}`;
}

const fileList = (r: Result) => (Array.isArray(r.files) ? r.files.length : num(r.fileCount));

function countParts(t: TFunction, key: string, count: number | undefined, min = 1) {
  return count != null && count >= min ? t(key, { count }) : undefined;
}

const CODEC_LABELS: Record<string, string> = { h264: "H.264", hevc: "H.265", av1: "AV1", vp9: "VP9" };
const CPU_CODECS: Record<string, string> = { libx264: "h264", libx265: "hevc", "libaom-av1": "av1", "libvpx-vp9": "vp9" };
const DEVICE_LABELS: Record<string, string> = { nvenc: "NVENC", qsv: "Quick Sync", amf: "AMF" };

/** "H.265, NVENC" for an FFmpeg encoder name; "copy" means the picture was not encoded. */
export function encoderLabel(t: TFunction, encoder: string): string | undefined {
  if (encoder === "copy") return t("jobs.summary.notEncoded");
  const cpuCodec = CPU_CODECS[encoder];
  const [codec, device] = cpuCodec ? [cpuCodec, ""] : encoder.split("_");
  const codecLabel = CODEC_LABELS[codec];
  if (!codecLabel) return undefined;
  return t("jobs.summary.encoder", { codec: codecLabel, device: device ? (DEVICE_LABELS[device] ?? device) : t("jobs.summary.cpu") });
}

function encodersPart(t: TFunction, r: Result) {
  if (!Array.isArray(r.encoders)) return undefined;
  const labels = r.encoders.map((name) => (typeof name === "string" ? encoderLabel(t, name) : undefined)).filter(Boolean);
  return labels.length ? labels.join(" / ") : undefined;
}

function failedPart(t: TFunction, r: Result) {
  return countParts(t, "jobs.summary.failed", positive(r.failed));
}

function summarise(t: TFunction, kind: string, r: Result): (string | undefined)[] {
  switch (kind) {
    case "download": {
      const height = positive(r.height);
      const length = positive(r.length);
      return [
        height != null ? `${height}p` : undefined,
        text(r.ext)?.toUpperCase(),
        length != null ? formatDuration(length) : undefined,
        bytes(r.size),
      ];
    }
    case "download.batch": {
      const total = num(r.total) ?? (Array.isArray(r.items) ? r.items.length : undefined);
      const succeeded = num(r.succeeded);
      return [
        succeeded != null && total != null ? t("jobs.summary.itemsOf", { done: succeeded, total }) : undefined,
        failedPart(t, r),
        bytes(r.totalSize),
      ];
    }
    case "instagram":
      return [countParts(t, "jobs.summary.files", fileList(r)), failedPart(t, r), bytes(r.size)];
    case "compressor":
    case "gif_editor.render":
      return [
        countParts(t, "jobs.summary.files", num(r.processed), 2),
        sizeChange(r.inBytes, r.outBytes, r.savedPercent),
        failedPart(t, r),
      ];
    case "converter":
      return [
        countParts(t, "jobs.summary.files", num(r.converted)),
        sizeChange(r.inputBytes, r.outputBytes),
        failedPart(t, r),
      ];
    case "image_editor":
      return [countParts(t, "jobs.summary.files", num(r.processed)), failedPart(t, r)];
    case "pdf.merge":
    case "pdf.from_images":
      return [countParts(t, "jobs.summary.pages", positive(r.pageCount)), bytes(r.bytes)];
    case "pdf.compress":
      return [sizeChange(r.inBytes, r.outBytes, r.savedPercent)];
    case "pdf.split":
    case "pdf.to_images":
      return [countParts(t, "jobs.summary.files", positive(r.count))];
    case "pdf.extract_text":
      return [countParts(t, "jobs.summary.chars", num(r.charCount), 0), bytes(r.bytes)];
    case "media_convert":
      return [
        countParts(t, "jobs.summary.files", num(r.converted), 2),
        encodersPart(t, r),
        sizeChange(r.inBytes, r.outBytes),
        countParts(t, "jobs.summary.subtitlesSkipped", positive(r.subtitlesSkipped)),
        failedPart(t, r),
      ];
    case "video_to_gif.render":
      return [dimensions(r), countParts(t, "jobs.summary.frames", positive(r.frames)), bytes(r.size)];
    case "transcribe": {
      const length = positive(r.duration);
      return [
        text(r.language)?.toUpperCase(),
        length != null ? formatDuration(length) : undefined,
        text(r.format)?.toUpperCase(),
      ];
    }
    case "video_sync": {
      const offset = num(r.offsetSec);
      return [
        offset != null ? t("jobs.summary.offset", { value: `${offset > 0 ? "+" : ""}${offset.toFixed(2)}` }) : undefined,
        bytes(r.bytes),
      ];
    }
    case "upscale":
    case "rembg":
    case "watermark":
      return [dimensions(r)];
    case "duplicates.image":
    case "duplicates.video": {
      const groups = Array.isArray(r.groups) ? r.groups.length : num(r.groups);
      return [
        groups != null ? t("jobs.summary.groups", { count: groups }) : undefined,
        countParts(t, "jobs.summary.scanned", positive(r.scanned)),
      ];
    }
    case "duplicates.trash":
      return [countParts(t, "jobs.summary.files", positive(r.count)), failedPart(t, r)];
    case "tts":
      return [bytes(r.bytes)];
    default:
      return [];
  }
}

/** Short parts describing a finished job's result; empty for kinds with nothing worth showing. */
export function jobSummary(t: TFunction, kind: string, result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  return summarise(t, kind, result as Result).filter((part): part is string => !!part);
}

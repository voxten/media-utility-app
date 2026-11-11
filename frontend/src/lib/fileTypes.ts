// Extension lists and display names shared by drop zones, native file dialogs, format pickers and the transfer modal.

import type { TFunction } from "i18next";
import type { SelectOption } from "../components/Select";

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];
export const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".wmv", ".ts", ".m4v"];
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg", ".opus"];
export const PDF_EXTENSIONS = [".pdf"];
export const GIF_EXTENSIONS = [".gif"];
/** IMAGE_EXTENSIONS plus GIF, for the tools that can read animated or palette GIFs. */
export const ALL_IMAGE_EXTENSIONS = [...IMAGE_EXTENSIONS, ...GIF_EXTENSIONS];
/** Formats the GIF Editor can open as animations. */
export const ANIMATION_EXTENSIONS = [...GIF_EXTENSIONS, ".webp", ".png", ".apng"];

/** Lower-case extension with the dot, or "" when the path has none. */
export function fileExtension(path: string) {
  return path.match(/\.[^.\\/]+$/)?.[0].toLowerCase() ?? "";
}

/** Kinds of files that tools can pass to each other through "Send to". */
export type MediaKind = "gif" | "image" | "pdf" | "video";

export function mediaKind(path: string): MediaKind | null {
  const ext = fileExtension(path);
  if (GIF_EXTENSIONS.includes(ext)) return "gif";
  if (ALL_IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (PDF_EXTENSIONS.includes(ext)) return "pdf";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

export const FILE_TYPES = {
  images: IMAGE_EXTENSIONS,
  videos: VIDEO_EXTENSIONS,
  animations: ANIMATION_EXTENSIONS,
  audio: AUDIO_EXTENSIONS,
  pdf: PDF_EXTENSIONS,
  text: [".txt"],
  csv: [".csv"],
  executables: [".exe"],
  cookies: [".txt"],
};

export type FileKind = keyof typeof FILE_TYPES;

/** Native dialog filter such as "Images (*.png;*.jpg)"; pass `extensions` to narrow or widen the default list. */
export function dialogFilter(t: TFunction, kind: FileKind, extensions: string[] = FILE_TYPES[kind]) {
  return `${t(`fileTypes.${kind}`)} (${extensions.map((e) => `*${e}`).join(";")})`;
}

export function allFilesFilter(t: TFunction) {
  return `${t("fileTypes.all")} (*.*)`;
}

/** Names that are not just the upper-cased id: aliases and mixed-case brands. */
const FORMAT_NAMES: Record<string, string> = {
  jpg: "JPEG",
  tif: "TIFF",
  webp: "WebP",
  webm: "WebM",
};

/** Display name for a format id, extension or codec ("webp", ".jpg", "WEBP" → "WebP", "JPEG", "WebP"). */
export function formatName(format: string) {
  const key = format.replace(/^\./, "").toLowerCase();
  return FORMAT_NAMES[key] ?? key.toUpperCase();
}

/** Comma-separated display names for an extension list, e.g. for drop zone hints. */
export function formatList(extensions: string[]) {
  return Array.from(new Set(extensions.map(formatName))).join(", ");
}

export type ImageOutputFormat = "original" | "png" | "jpeg" | "webp";

export function imageFormatLabel(t: TFunction, format: ImageOutputFormat) {
  return format === "original" ? t("common.formatOriginal") : formatName(format);
}

/** Options for a format picker; values stay as given (the backend's ids), labels are display names. */
export function formatOptions<T extends string>(formats: readonly T[]): SelectOption<T>[] {
  return formats.map((value) => ({ value, label: formatName(value) }));
}

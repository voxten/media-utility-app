// Extension lists shared by drop zones, native file dialogs and the transfer modal.

import type { TFunction } from "i18next";

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];
export const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".wmv", ".ts", ".m4v"];
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg", ".opus"];
export const PDF_EXTENSIONS = [".pdf"];

export const FILE_TYPES = {
  images: IMAGE_EXTENSIONS,
  videos: VIDEO_EXTENSIONS,
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

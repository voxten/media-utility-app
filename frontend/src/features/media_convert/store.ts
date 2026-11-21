// Video converter form state, kept across page switches.

import { create } from "zustand";
import type { VideoCodec } from "../../lib/types";

export const VIDEO_FORMATS = ["mp4", "mkv", "mov", "webm"] as const;
export const AUDIO_FORMATS = ["mp3", "m4a", "ogg", "opus", "wav", "flac"] as const;
export type OutputFormat = (typeof VIDEO_FORMATS)[number] | (typeof AUDIO_FORMATS)[number];
export const LOSSLESS = new Set<OutputFormat>(["wav", "flac"]);
export const QUALITIES = ["high", "balanced", "small"] as const;
export type Quality = (typeof QUALITIES)[number];
export const HEIGHTS = ["0", "2160", "1440", "1080", "720", "480", "360"] as const;
export type Height = (typeof HEIGHTS)[number];
export const BITRATES = ["96", "128", "160", "192", "256", "320"] as const;
export type Bitrate = (typeof BITRATES)[number];
export type SizeMode = "quality" | "size" | "copy";
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

interface MediaConvertForm {
  files: string[];
  format: OutputFormat;
  codec: VideoCodec;
  sizeMode: SizeMode;
  quality: Quality;
  targetMb: number;
  height: Height;
  mute: boolean;
  audioKbps: Bitrate;
  normalize: boolean;
  /** Trim of the only file, in seconds; null keeps the whole file. */
  range: { start: number; end: number } | null;
  outputDir: string;
  set: (patch: Partial<Omit<MediaConvertForm, "set">>) => void;
}

export const useMediaConvertForm = create<MediaConvertForm>((set) => ({
  files: [],
  format: "mp4",
  codec: "h264",
  sizeMode: "quality",
  quality: "balanced",
  targetMb: 25,
  height: "0",
  mute: false,
  audioKbps: "192",
  normalize: false,
  range: null,
  outputDir: "",
  set: (patch) => set(patch),
}));

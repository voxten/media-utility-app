// GIF tools state, kept across page switches.

import { create } from "zustand";
import type { CropRect } from "../../components/InteractiveCropOverlay";
import type { VideoInfo } from "../../lib/types";

export type ProbedVideo = VideoInfo & { gifsicle: boolean };

export interface Edits {
  trim: { start: number; end: number } | null;
  crop: CropRect | null;
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  scale: number;
  speed: number;
  reverse: boolean;
  boomerang: boolean;
}

export const NO_EDITS: Edits = { trim: null, crop: null, rotate: 0, flipH: false, flipV: false, scale: 100, speed: 1, reverse: false, boomerang: false };

interface GifEditorForm {
  files: string[];
  selected: number;
  editsByFile: Record<string, Edits>;
  outputDir: string;
  set: (patch: Partial<Omit<GifEditorForm, "set">>) => void;
}

export const useGifEditorForm = create<GifEditorForm>((set) => ({
  files: [],
  selected: 0,
  editsByFile: {},
  outputDir: "",
  set: (patch) => set(patch),
}));

interface VideoToGifForm {
  video: ProbedVideo | null;
  range: { start: number; end: number };
  fps: number;
  /** Output width in px; 0 keeps the source width. */
  width: number;
  speed: number;
  reverse: boolean;
  crop: CropRect | null;
  outputDir: string;
  set: (patch: Partial<Omit<VideoToGifForm, "set">>) => void;
}

export const useVideoToGifForm = create<VideoToGifForm>((set) => ({
  video: null,
  range: { start: 0, end: 0 },
  fps: 12,
  width: 0,
  speed: 1,
  reverse: false,
  crop: null,
  outputDir: "",
  set: (patch) => set(patch),
}));

// GIF tools state, kept across page switches.

import { create } from "zustand";
import type { CropRect } from "../../components/InteractiveCropOverlay";
import type { GifOperations, VideoInfo } from "../../lib/types";

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

export function toOperations(edits: Edits): GifOperations {
  const ops: GifOperations = {};
  if (edits.trim) ops.trim = edits.trim;
  if (edits.crop) ops.crop = { x: edits.crop.x, y: edits.crop.y, width: edits.crop.w, height: edits.crop.h };
  if (edits.rotate) ops.rotate = edits.rotate;
  if (edits.flipH) ops.flip_h = true;
  if (edits.flipV) ops.flip_v = true;
  if (edits.scale < 100) ops.resize = { percent: edits.scale };
  if (edits.speed !== 1) ops.speed = edits.speed;
  if (edits.reverse) ops.reverse = true;
  if (edits.boomerang) ops.boomerang = true;
  return ops;
}

/** The edits that give `ops` (the reverse of toOperations), for a render opened from the task history. */
export function editsFromOperations(ops: GifOperations): Edits {
  return {
    trim: ops.trim ?? null,
    crop: ops.crop ? { x: ops.crop.x, y: ops.crop.y, w: ops.crop.width, h: ops.crop.height } : null,
    rotate: ops.rotate ?? 0,
    flipH: !!ops.flip_h,
    flipV: !!ops.flip_v,
    scale: ops.resize?.percent ?? 100,
    speed: ops.speed ?? 1,
    reverse: !!ops.reverse,
    boomerang: !!ops.boomerang,
  };
}

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

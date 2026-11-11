// Compressor form state, kept across page switches.

import { create } from "zustand";
import type { ImageOutputFormat } from "../../lib/fileTypes";

export type CompressMode = "smart" | "lossless" | "target";

interface CompressorForm {
  files: string[];
  selected: number;
  mode: CompressMode;
  format: ImageOutputFormat;
  quality: number;
  targetKb: string;
  outputDir: string;
  set: (patch: Partial<Omit<CompressorForm, "set">>) => void;
}

export const useCompressorForm = create<CompressorForm>((set) => ({
  files: [],
  selected: 0,
  mode: "smart",
  format: "original",
  quality: 80,
  targetKb: "500",
  outputDir: "",
  set: (patch) => set(patch),
}));

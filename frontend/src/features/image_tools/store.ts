// Image tools state, kept across page switches: files, per-file edits, active tool and output.

import { create } from "zustand";
import type { ImageOutputFormat } from "../../lib/fileTypes";
import type { ActiveTool, ImageOperations } from "./types";

export interface SavedImage {
  outPath: string;
  width: number;
  height: number;
  bytes: number;
}

interface ImageToolsForm {
  files: string[];
  selected: number;
  opsByFile: Record<string, ImageOperations>;
  sizes: Record<string, { width: number; height: number }>;
  activeTool: ActiveTool;
  outputFormat: ImageOutputFormat;
  outputDir: string;
  saved: SavedImage | null;
  set: (patch: Partial<Omit<ImageToolsForm, "set">>) => void;
}

export const useImageToolsForm = create<ImageToolsForm>((set) => ({
  files: [],
  selected: 0,
  opsByFile: {},
  sizes: {},
  activeTool: "crop",
  outputFormat: "original",
  outputDir: "",
  saved: null,
  set: (patch) => set(patch),
}));

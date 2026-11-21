// Background remover form state, kept across page switches.

import { create } from "zustand";
import type { RemBgPreview, RemBgResult } from "../../lib/types";

export type ModelType = "birefnet" | "birefnet-lite" | "isnet" | "u2net";
export type BgMode = "checker" | "black" | "white" | "green";

interface RemBgFormState {
  image: RemBgPreview | null;
  sourcePath: string;
  result: RemBgResult | null;
  model: ModelType;
  antiHalo: boolean;
  choke: number;
  feather: number;
  despeckle: boolean;
  bgMode: BgMode;
  set: (patch: Partial<Omit<RemBgFormState, "set">>) => void;
}

export const useRemBgForm = create<RemBgFormState>((set) => ({
  image: null,
  sourcePath: "",
  result: null,
  model: "birefnet",
  antiHalo: true,
  choke: 1,
  feather: 0,
  despeckle: true,
  bgMode: "checker",
  set: (patch) => set(patch),
}));

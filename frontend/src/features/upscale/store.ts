// Upscale form state, kept across page switches.

import { create } from "zustand";
import type { UpscalePreview, UpscaleResult } from "../../lib/types";

export type ModelType = "general" | "anime";
export type AlphaMode = "smooth" | "ai";

interface UpscaleFormState {
  image: UpscalePreview | null;
  sourcePath: string;
  result: UpscaleResult | null;
  model: ModelType;
  scale: 2 | 4;
  alphaMode: AlphaMode;
  antiHalo: boolean;
  set: (patch: Partial<Omit<UpscaleFormState, "set">>) => void;
}

export const useUpscaleForm = create<UpscaleFormState>((set) => ({
  image: null,
  sourcePath: "",
  result: null,
  model: "general",
  scale: 4,
  alphaMode: "smooth",
  antiHalo: true,
  set: (patch) => set(patch),
}));

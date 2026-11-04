// Instagram form state, kept across page switches.

import { create } from "zustand";
import type { InstagramListing, InstagramResult } from "../../lib/types";

interface InstagramForm {
  url: string;
  post: InstagramListing | null;
  selected: number[];
  outdir: string;
  result: InstagramResult | null;
  set: (patch: Partial<Omit<InstagramForm, "set">>) => void;
}

export const useInstagramForm = create<InstagramForm>((set) => ({
  url: "",
  post: null,
  selected: [],
  outdir: "",
  result: null,
  set: (patch) => set(patch),
}));

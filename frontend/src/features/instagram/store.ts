// Instagram form state, kept across page switches.

import { create } from "zustand";
import type { InstagramListing, InstagramResult } from "../../lib/types";

interface InstagramForm {
  url: string;
  post: InstagramListing | null;
  selected: number[];
  outdir: string;
  result: InstagramResult | null;
  /** Check the link as soon as the page shows it (set when a copied link is opened). */
  autoProbe: boolean;
  set: (patch: Partial<Omit<InstagramForm, "set">>) => void;
}

export const useInstagramForm = create<InstagramForm>((set) => ({
  url: "",
  post: null,
  selected: [],
  outdir: "",
  result: null,
  autoProbe: false,
  set: (patch) => set(patch),
}));

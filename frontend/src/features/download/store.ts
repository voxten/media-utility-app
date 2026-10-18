// Download form state, kept across page switches.

import { create } from "zustand";
import type { Mode, ProbeResult } from "./types";

interface DownloadForm {
  tab: "single" | "batch";
  url: string;
  probe: ProbeResult | null;
  mode: Mode;
  formatId: string;
  audioCodec: string;
  batchText: string;
  outdir: string;
  template: string;
  set: (patch: Partial<Omit<DownloadForm, "set">>) => void;
}

export const useDownloadForm = create<DownloadForm>((set) => ({
  tab: "single",
  url: "",
  probe: null,
  mode: "video",
  formatId: "",
  audioCodec: "mp3",
  batchText: "",
  outdir: "",
  template: "{title}.{ext}",
  set: (patch) => set(patch),
}));

// Download form state, kept across page switches.

import { create } from "zustand";
import type { BatchItem, BatchMode, Mode, ProbeResult } from "./types";

interface DownloadForm {
  tab: "single" | "batch";
  url: string;
  probe: ProbeResult | null;
  mode: Mode;
  formatId: string;
  audioCodec: string;
  /** What queued links and playlists download; ``maxHeight`` 0 means the best quality. */
  batchMode: BatchMode;
  maxHeight: number;
  /** Indices of the checked playlist entries. */
  selectedEntries: number[];
  batchText: string;
  /** Items of the last finished queue, shown until the next one starts. */
  lastBatch: BatchItem[] | null;
  outdir: string;
  template: string;
  /** Check the link as soon as the page shows it (set when a copied link is opened). */
  autoProbe: boolean;
  set: (patch: Partial<Omit<DownloadForm, "set">>) => void;
}

export const useDownloadForm = create<DownloadForm>((set) => ({
  tab: "single",
  url: "",
  probe: null,
  mode: "video",
  formatId: "",
  audioCodec: "mp3",
  batchMode: "video",
  maxHeight: 0,
  selectedEntries: [],
  batchText: "",
  lastBatch: null,
  outdir: "",
  template: "{title}.{ext}",
  autoProbe: false,
  set: (patch) => set(patch),
}));

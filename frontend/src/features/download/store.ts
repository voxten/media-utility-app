// Download form state, kept across page switches.

import { create } from "zustand";
import type { BatchItem, BatchMode, Mode, ProbeResult } from "./types";

/** Choices of a download opened from the task history, applied once its link has been checked. */
export interface DownloadRestore {
  mode: Mode;
  formatId: string;
  clipStart: string;
  clipEnd: string;
}

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
  restore: DownloadRestore | null;
  sponsorblock: boolean;
  clip: boolean;
  clipStart: string;
  clipEnd: string;
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
  restore: null,
  sponsorblock: false,
  clip: false,
  clipStart: "",
  clipEnd: "",
  set: (patch) => set(patch),
}));

/** The form after a link check: the first video format, or the restored choice when the result still offers it. */
export function probedForm(result: ProbeResult, restore: DownloadRestore | null): Partial<DownloadForm> {
  const formats = restore ? result.formats[restore.mode] : undefined;
  const mode = restore && formats?.length ? restore.mode : "video";
  const offered = mode === restore?.mode ? formats ?? [] : result.formats.video;
  const clip = !!restore?.clipEnd && !result.isPlaylist;
  return {
    probe: result,
    mode,
    formatId: offered.find((f) => f.id === restore?.formatId)?.id ?? offered[0]?.id ?? "",
    selectedEntries: (result.entries ?? []).map((_, i) => i),
    clip,
    clipStart: clip ? restore?.clipStart ?? "" : "",
    clipEnd: clip ? restore?.clipEnd ?? "" : "",
    restore: null,
  };
}

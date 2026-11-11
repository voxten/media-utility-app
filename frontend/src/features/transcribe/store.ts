// Transcription form state, kept across page switches.

import { create } from "zustand";
import type { TranscribeOptions, VideoInfo } from "../../lib/types";

interface TranscribeForm {
  media: VideoInfo | null;
  /** Options changed in this session; null until then, so the ones saved in Settings apply. */
  options: TranscribeOptions | null;
  outputDir: string;
  set: (patch: Partial<Omit<TranscribeForm, "set">>) => void;
}

export const useTranscribeForm = create<TranscribeForm>((set) => ({
  media: null,
  options: null,
  outputDir: "",
  set: (patch) => set(patch),
}));

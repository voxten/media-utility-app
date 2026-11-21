// Text to speech form state, kept across page switches.

import { create } from "zustand";

export type Engine = "edge" | "pyttsx3";

export const FORMATS = ["mp3", "wav", "ogg", "flac"] as const;
export type AudioFormat = (typeof FORMATS)[number];

interface TtsForm {
  text: string;
  engine: Engine;
  voice: string;
  locale: string;
  rate: { edge: number; pyttsx3: number };
  format: AudioFormat;
  outDir: string;
  fileName: string;
  audioSrc: string | null;
  lastOutput: string | null;
  set: (patch: Partial<Omit<TtsForm, "set">>) => void;
}

export const useTtsForm = create<TtsForm>((set) => ({
  text: "",
  engine: "edge",
  voice: "",
  locale: "",
  rate: { edge: 0, pyttsx3: 200 },
  format: "mp3",
  outDir: "",
  fileName: "",
  audioSrc: null,
  lastOutput: null,
  set: (patch) => set(patch),
}));

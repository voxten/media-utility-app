// Text from image form state, kept across page switches.

import { create } from "zustand";

interface OcrForm {
  /** Images, or one PDF. */
  sources: string[];
  /** The recognized text as the user edited it. */
  text: string;
  /** For a PDF: also save a copy with an invisible text layer. */
  searchablePdf: boolean;
  outputDir: string;
  set: (patch: Partial<Omit<OcrForm, "set">>) => void;
}

export const useOcrForm = create<OcrForm>((set) => ({
  sources: [],
  text: "",
  searchablePdf: true,
  outputDir: "",
  set: (patch) => set(patch),
}));

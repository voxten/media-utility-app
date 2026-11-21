// Image converter form state, kept across page switches.

import { create } from "zustand";

export const FORMATS = ["PNG", "WEBP", "JPEG", "GIF", "TIFF", "BMP", "PDF"] as const;
export type ImageFormat = (typeof FORMATS)[number];
export type InputFormat = Exclude<ImageFormat, "PDF">;
export const INPUT_FORMATS = FORMATS.filter((f): f is InputFormat => f !== "PDF");
export type Source = "files" | "folder";

interface ConverterForm {
  source: Source;
  inputDir: string;
  files: string[];
  inFormat: InputFormat;
  outFormat: ImageFormat;
  outputDir: string;
  quality: number;
  method: number;
  matching: number | null;
  set: (patch: Partial<Omit<ConverterForm, "set">>) => void;
}

export const useConverterForm = create<ConverterForm>((set) => ({
  source: "files",
  inputDir: "",
  files: [],
  inFormat: "PNG",
  outFormat: "WEBP",
  outputDir: "",
  quality: 80,
  method: 6,
  matching: null,
  set: (patch) => set(patch),
}));

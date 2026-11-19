// PDF tools form state, kept across page switches.

import { create } from "zustand";

type Patch<T> = Partial<Omit<T, "set">>;

export const PDF_IMAGE_FORMATS = ["png", "jpeg", "webp"] as const;
export type PdfImageFormat = (typeof PDF_IMAGE_FORMATS)[number];

interface ConvertForm {
  subTab: "pdfToImages" | "imagesToPdf";
  pdfFile: string | null;
  format: PdfImageFormat;
  dpi: number;
  pageRange: string;
  imageFiles: string[];
  outputDir: string;
  pdfName: string;
  set: (patch: Patch<ConvertForm>) => void;
}

export const usePdfConvertForm = create<ConvertForm>((set) => ({
  subTab: "pdfToImages",
  pdfFile: null,
  format: "png",
  dpi: 150,
  pageRange: "",
  imageFiles: [],
  outputDir: "",
  pdfName: "",
  set: (patch) => set(patch),
}));

export type SplitMode = "all" | "groups";

/** One output file: its colour slot (kept when other groups are removed) and 0-based pages in order. */
export interface SplitGroup {
  color: number;
  pages: number[];
}

export const FIRST_GROUP: SplitGroup[] = [{ color: 0, pages: [] }];

interface SplitForm {
  file: string | null;
  mode: SplitMode;
  groups: SplitGroup[];
  active: number;
  lastPage: number | null;
  outputDir: string;
  set: (patch: Patch<SplitForm>) => void;
}

export const usePdfSplitForm = create<SplitForm>((set) => ({
  file: null,
  mode: "all",
  groups: FIRST_GROUP,
  active: 0,
  lastPage: null,
  outputDir: "",
  set: (patch) => set(patch),
}));

export type CompressPreset = "low" | "balanced" | "high";

interface SingleFileForm {
  file: string | null;
  preset: CompressPreset;
  outputDir: string;
  set: (patch: Patch<SingleFileForm>) => void;
}

const singleFileForm = () =>
  create<SingleFileForm>((set) => ({
    file: null,
    preset: "balanced",
    outputDir: "",
    set: (patch) => set(patch),
  }));

export const usePdfCompressForm = singleFileForm();
export const usePdfExtractForm = singleFileForm();

export type ActiveTool = "select" | "crop" | "resize" | "transform";

export interface PreviewData {
  path: string;
  fileName: string;
  size: number;
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  dataUrl: string;
}

export interface TransformResult {
  width: number;
  height: number;
  hasAlpha: boolean;
  dataUrl: string;
}

export interface BatchResult {
  total: number;
  processed: number;
  failed: number;
  outputDir: string;
  files?: string[];
  results: { file: string; dest: string; width: number; height: number; bytes: number }[];
}

export interface ImageOperations {
  resizeActive: boolean;
  targetWidth?: number;
  targetHeight?: number;
  lockAspect: boolean;
  aspectRatio?: number;
  filter: "lanczos" | "bicubic" | "bilinear" | "nearest";
  scalePercent?: number;

  cropActive: boolean;
  cropPreset: string;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;

  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

export const createDefaultOperations = (width = 0, height = 0): ImageOperations => ({
  resizeActive: false,
  targetWidth: width || undefined,
  targetHeight: height || undefined,
  lockAspect: true,
  aspectRatio: width && height ? width / height : 1,
  filter: "lanczos",
  cropActive: false,
  cropPreset: "free",
  cropX: 0,
  cropY: 0,
  cropW: width || 0,
  cropH: height || 0,
  rotation: 0,
  flipH: false,
  flipV: false,
});

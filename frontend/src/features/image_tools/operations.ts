// Editor state → the backend's operation dict. Crop and resize values are pixels of the image they
// were set on (`baseWidth` × `baseHeight`); fitOps carries them over to an image of another size,
// which "Apply to all" relies on, so a portrait photo is not stretched to a landscape size.

import type { ImageOperations } from "./types";

export const CROP_RATIOS: Record<string, number> = { "1_1": 1, "16_9": 16 / 9, "9_16": 9 / 16, "4_3": 4 / 3, "3_2": 3 / 2 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The same edit for an image of `width` × `height`: crop and resize keep their place and share of the picture. */
export function fitOps(ops: ImageOperations, width: number, height: number): ImageOperations {
  const baseW = ops.baseWidth || width;
  const baseH = ops.baseHeight || height;
  const next: ImageOperations = { ...ops, baseWidth: width, baseHeight: height };
  if (!width || !height || (baseW === width && baseH === height)) return next;
  const sx = width / baseW;
  const sy = height / baseH;

  if (ops.cropActive) {
    // A preset ratio (1:1, 16:9 …) stays that ratio; a free crop keeps its share of each side.
    const uniform = CROP_RATIOS[ops.cropPreset] ? Math.min(sx, sy) : 0;
    const w = clamp(Math.round(ops.cropW * (uniform || sx)), 1, width);
    const h = clamp(Math.round(ops.cropH * (uniform || sy)), 1, height);
    next.cropX = clamp(Math.round((ops.cropX + ops.cropW / 2) * sx - w / 2), 0, width - w);
    next.cropY = clamp(Math.round((ops.cropY + ops.cropH / 2) * sy - h / 2), 0, height - h);
    next.cropW = w;
    next.cropH = h;
  } else {
    Object.assign(next, { cropX: 0, cropY: 0, cropW: width, cropH: height });
  }

  if (ops.targetWidth && ops.targetHeight) {
    next.targetWidth = Math.max(1, Math.round(ops.targetWidth * sx));
    next.targetHeight = Math.max(1, Math.round(ops.targetHeight * sy));
    next.aspectRatio = next.targetWidth / next.targetHeight;
  }
  return next;
}

/** The backend's operation dict for an image of the given natural size. */
export function compileOps(ops: ImageOperations, width: number, height: number): Record<string, unknown> {
  const fitted = fitOps(ops, width, height);
  const res: Record<string, unknown> = {};
  const { cropX, cropY, cropW, cropH } = fitted;
  if (fitted.cropActive && cropW > 0 && cropH > 0 && (cropW < width || cropH < height || cropX > 0 || cropY > 0)) {
    res.crop = {
      x: Math.max(0, cropX),
      y: Math.max(0, cropY),
      width: Math.min(width - cropX, cropW),
      height: Math.min(height - cropY, cropH),
    };
  }
  if (fitted.rotation !== 0) res.rotate = fitted.rotation;
  if (fitted.flipH) res.flip_h = true;
  if (fitted.flipV) res.flip_v = true;
  if (fitted.resizeActive) {
    if (fitted.scalePercent != null && fitted.scalePercent > 0 && fitted.scalePercent !== 100) {
      res.resize = { percent: fitted.scalePercent, filter: fitted.filter || "lanczos" };
    } else if (
      fitted.targetWidth &&
      fitted.targetHeight &&
      (fitted.targetWidth !== width || fitted.targetHeight !== height)
    ) {
      res.resize = { width: fitted.targetWidth, height: fitted.targetHeight, filter: fitted.filter || "lanczos" };
    }
  }
  return res;
}

export const isEdited = (ops: ImageOperations | undefined) =>
  !!ops && (ops.resizeActive || ops.cropActive || ops.rotation !== 0 || ops.flipH || ops.flipV);

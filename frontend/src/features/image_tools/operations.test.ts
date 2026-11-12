import { describe, expect, it } from "vitest";
import { compileOps, fitOps, isEdited } from "./operations";
import { createDefaultOperations, type ImageOperations } from "./types";

const landscape = (patch: Partial<ImageOperations>): ImageOperations => ({ ...createDefaultOperations(4000, 3000), ...patch });

describe("image tool operations", () => {
  it("rotates and flips a file whose size was never loaded", () => {
    const ops = landscape({ rotation: 90, flipH: true });
    expect(compileOps(ops, 3000, 4000)).toEqual({ rotate: 90, flip_h: true });
  });

  it("resizes a portrait photo by the same share instead of stretching it", () => {
    const ops = landscape({ resizeActive: true, targetWidth: 2000, targetHeight: 1500 });
    expect(compileOps(ops, 3000, 4000).resize).toEqual({ width: 1500, height: 2000, filter: "lanczos" });
  });

  it("keeps a free crop's share of each side", () => {
    const ops = landscape({ cropActive: true, cropX: 1000, cropY: 750, cropW: 2000, cropH: 1500 });
    expect(compileOps(ops, 2000, 1500).crop).toEqual({ x: 500, y: 375, width: 1000, height: 750 });
  });

  it("keeps a preset crop's ratio on a photo of another shape", () => {
    const ops = landscape({ cropActive: true, cropPreset: "1_1", cropX: 500, cropY: 0, cropW: 3000, cropH: 3000 });
    const crop = compileOps(ops, 3000, 4000).crop as { x: number; y: number; width: number; height: number };
    expect(crop.width).toBe(crop.height);
    expect(crop.x + crop.width).toBeLessThanOrEqual(3000);
    expect(crop.y + crop.height).toBeLessThanOrEqual(4000);
  });

  it("leaves edits on the photo they were made on unchanged", () => {
    const ops = landscape({ cropActive: true, cropX: 10, cropY: 20, cropW: 100, cropH: 200 });
    expect(fitOps(ops, 4000, 3000)).toMatchObject({ cropX: 10, cropY: 20, cropW: 100, cropH: 200 });
    expect(compileOps(createDefaultOperations(4000, 3000), 4000, 3000)).toEqual({});
  });

  it("knows which files carry an edit", () => {
    expect(isEdited(undefined)).toBe(false);
    expect(isEdited(createDefaultOperations(10, 10))).toBe(false);
    expect(isEdited(landscape({ flipV: true }))).toBe(true);
  });
});

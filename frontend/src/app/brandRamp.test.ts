import { describe, expect, it } from "vitest";
import { brandRamp, contrastRatio, withContrast } from "./brandRamp";
import { ACCENT_PRESETS, buildTheme, darkTheme, lightTheme } from "./theme";

const COLORS = [...Object.values(ACCENT_PRESETS), "#0078d4", "#ffff00", "#ffffff", "#000080", "#000000", "#00ff7f"];
const STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160] as const;

describe("brandRamp", () => {
  it.each(COLORS)("makes 16 shades from dark to light for %s", (color) => {
    const ramp = brandRamp(color);
    const shades = STEPS.map((step) => ramp[step]);
    shades.forEach((shade) => expect(shade).toMatch(/^#[0-9a-f]{6}$/));
    const contrastToBlack = shades.map((shade) => contrastRatio(shade, "#000000"));
    contrastToBlack.slice(1).forEach((value, i) => expect(value).toBeGreaterThanOrEqual(contrastToBlack[i] - 0.01));
  });

  it.each(COLORS)("keeps white text readable on primary buttons for %s", (color) => {
    expect(contrastRatio("#ffffff", brandRamp(color)[80])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", buildTheme(true, color).colorBrandBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COLORS)("keeps brand text readable on dark cards for %s", (color) => {
    const theme = buildTheme(true, color);
    expect(contrastRatio(theme.colorBrandForeground1, theme.colorNeutralCardBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colorBrandForegroundLink, theme.colorNeutralCardBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps an accent that is already dark enough", () => {
    expect(brandRamp("#0f6cbd")[80]).toBe("#0f6cbd");
  });
});

describe("buildTheme", () => {
  it("uses the app's own indigo without an accent", () => {
    expect(buildTheme(true, null)).toBe(darkTheme);
    expect(buildTheme(false, null)).toBe(lightTheme);
    expect(lightTheme.colorBrandBackground).toBe("#5b5fe0");
  });
});

describe("withContrast", () => {
  it("darkens on light backgrounds and lightens on dark ones", () => {
    expect(contrastRatio(withContrast("#ffff00", "#ffffff", 4.5), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(withContrast("#000080", "#2c2c2c", 4.5), "#2c2c2c")).toBeGreaterThanOrEqual(4.5);
  });
});

// Fluent needs 16 shades of the brand colour; these are made from one accent colour in OKLCH,
// where equal lightness steps look equally far apart.

import type { BrandVariants } from "@fluentui/react-components";

type Rgb = [number, number, number];
type Lch = [number, number, number];

const WHITE = "#ffffff";
/** WCAG AA for normal text. */
export const TEXT_CONTRAST = 4.5;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToLch([r, g, b]: Rgb): Lch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), Math.atan2(bb, a)];
}

function lchToRgbUnclamped([L, C, H]: Lch): Rgb {
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((c) => c >= -0.001 && c <= 1.001);

/** The colour at this lightness and hue, with chroma lowered until it fits in sRGB. */
function lchToHex([L, C, H]: Lch): string {
  let chroma = C;
  let rgb = lchToRgbUnclamped([L, chroma, H]);
  while (!inGamut(rgb) && chroma > 0.001) {
    chroma *= 0.95;
    rgb = lchToRgbUnclamped([L, chroma, H]);
  }
  return rgbToHex(rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour made lighter (on a dark background) or darker (on a light one) until it reaches the ratio. */
export function withContrast(color: string, background: string, ratio: number): string {
  if (contrastRatio(color, background) >= ratio) return color;
  const [L, C, H] = rgbToLch(hexToRgb(color));
  const lighten = luminance(background) < 0.18;
  let [lo, hi] = lighten ? [L, 1] : [0, L];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const ok = contrastRatio(lchToHex([mid, C, H]), background) >= ratio;
    if (ok === lighten) hi = mid;
    else lo = mid;
  }
  return lchToHex([lighten ? hi : lo, C, H]);
}

const DARKEST = 0.15;
const LIGHTEST = 0.975;
/** Very dark accents would leave no room for the darker shades. */
const MIN_BASE_LIGHTNESS = 0.3;
const BASE = 7; // index of step 80

/**
 * Step 80 (primary buttons and brand text in the light theme) is the accent itself, darkened until
 * white text on it reaches 4.5:1; the other steps run evenly to near black and near white.
 */
export function brandRamp(hex: string): BrandVariants {
  const [L, C, H] = rgbToLch(hexToRgb(withContrast(hex, WHITE, TEXT_CONTRAST)));
  const base = Math.max(L, MIN_BASE_LIGHTNESS);
  const shades = Array.from({ length: 16 }, (_, i) => {
    if (i <= BASE) {
      const t = i / BASE;
      return lchToHex([DARKEST + (base - DARKEST) * t, C * (0.45 + 0.55 * t), H]);
    }
    const t = (i - BASE) / (15 - BASE);
    return lchToHex([base + (LIGHTEST - base) * t, C * (1 - 0.85 * t), H]);
  });
  return Object.fromEntries(shades.map((shade, i) => [(i + 1) * 10, shade])) as unknown as BrandVariants;
}

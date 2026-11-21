import { useEffect, useMemo, useState } from "react";
import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from "@fluentui/react-components";
import type { Accent, ThemePreference } from "../lib/types";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { brandRamp, TEXT_CONTRAST, withContrast } from "./brandRamp";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Resolves "system" against the OS setting (WebView2 reports the Windows app theme). */
export function useIsDark(preference: ThemePreference): boolean {
  const [systemDark, setSystemDark] = useState(() => query().matches);
  useEffect(() => {
    const mq = query();
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return preference === "system" ? systemDark : preference === "dark";
}

// Indigo from the app icon; 80 is the primary button colour in the light theme.
const appBrand: BrandVariants = {
  10: "#0e0f2f",
  20: "#191a49",
  30: "#242662",
  40: "#2f317b",
  50: "#3a3d94",
  60: "#4548ae",
  70: "#5054c7",
  80: "#5b5fe0",
  90: "#6d71e3",
  100: "#8083e7",
  110: "#9295ea",
  120: "#a5a7ee",
  130: "#b7b9f1",
  140: "#cacbf5",
  150: "#dcddf8",
  160: "#efeffc",
};

/** The accent choices besides the app's indigo and the Windows accent, as stored in the settings. */
export const ACCENT_PRESETS = {
  blue: "#0f6cbd",
  teal: "#03787c",
  green: "#107c10",
  orange: "#ca5010",
  red: "#c50f1f",
  pink: "#bf0077",
  purple: "#8764b8",
  graphite: "#5d5a58",
} as const;

/** What the swatch for the app's own accent shows. */
export const APP_ACCENT = appBrand[80];

const fontFamilyBase = "'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif";

/** App-specific tokens on top of Fluent's; FluentProvider writes every theme key as a CSS variable. */
export interface AppTheme extends Theme {
  /** The content area behind the cards (Shell), between the window base and the cards. */
  colorAppLayer: string;
  /** The content area over Mica: translucent like WinUI's layer fill, so the backdrop shows under the whole window. */
  colorAppLayerMica: string;
  /** Page titles: the Display optical size of Segoe UI Variable reads better at large sizes. */
  fontFamilyDisplay: string;
}

export const appTokens = {
  colorAppLayer: "var(--colorAppLayer)",
  colorAppLayerMica: "var(--colorAppLayerMica)",
  fontFamilyDisplay: "var(--fontFamilyDisplay)",
} as const;

const fontFamilyDisplay = "'Segoe UI Variable Display', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif";

const DARK_CARD = "#2c2c2c";

// Windows 11 layering: window base (navigation) → content layer → cards, each a step lighter in dark mode.
// Background1 is what Fluent paints inputs, buttons, menus and dialogs with, so it sits one step above the cards.
// Background4* is what Fluent's Nav components paint on, so it matches the window base.
function createAppDarkTheme(brand: BrandVariants): AppTheme {
  // Brand text sits on cards; a dark accent's light shades can still be too dim there.
  const foreground1 = withContrast(brand[110], DARK_CARD, TEXT_CONTRAST);
  return {
    ...createDarkTheme(brand),
    colorBrandForeground1: foreground1,
    colorBrandForeground2: withContrast(brand[120], DARK_CARD, TEXT_CONTRAST),
    colorBrandForegroundLink: foreground1,
    fontFamilyBase,
    fontFamilyDisplay,
    colorAppLayer: "#242424",
    colorAppLayerMica: "rgba(58, 58, 58, 0.3)",
    colorNeutralCardBackground: DARK_CARD,
    colorNeutralCardBackgroundHover: "#323232",
    colorNeutralCardBackgroundPressed: "#2a2a2a",
    colorNeutralCardBackgroundSelected: "#303030",
    colorNeutralBackground1: "#333333",
    colorNeutralBackground1Hover: "#3b3b3b",
    colorNeutralBackground1Pressed: "#2b2b2b",
    colorNeutralBackground1Selected: "#383838",
    colorNeutralBackground2: "#202020",
    colorNeutralBackground2Hover: "#272727",
    colorNeutralBackground2Pressed: "#1d1d1d",
    colorNeutralBackground3: "#1c1c1c",
    colorNeutralBackground4: "#202020",
    colorNeutralBackground4Hover: "#2d2d2d",
    colorNeutralBackground4Pressed: "#292929",
    colorNeutralBackground4Selected: "#2d2d2d",
    colorNeutralStroke3: "#383838",
  };
}

function createAppLightTheme(brand: BrandVariants): AppTheme {
  return {
    ...createLightTheme(brand),
    fontFamilyBase,
    fontFamilyDisplay,
    colorAppLayer: "#f9f9f9",
    colorAppLayerMica: "rgba(255, 255, 255, 0.5)",
    colorNeutralCardBackground: "#ffffff",
    colorNeutralCardBackgroundHover: "#fbfbfb",
    colorNeutralCardBackgroundPressed: "#f5f5f5",
    colorNeutralCardBackgroundSelected: "#f8f8f8",
    colorNeutralBackground2: "#f3f3f3",
    colorNeutralBackground2Hover: "#ececec",
    colorNeutralBackground2Pressed: "#e6e6e6",
    colorNeutralBackground3: "#eeeeee",
    colorNeutralBackground4: "#f3f3f3",
    colorNeutralBackground4Hover: "#e9e9e9",
    colorNeutralBackground4Pressed: "#e4e4e4",
    colorNeutralBackground4Selected: "#e9e9e9",
    colorNeutralStroke3: "#e5e5e5",
  };
}

export const darkTheme = createAppDarkTheme(appBrand);
export const lightTheme = createAppLightTheme(appBrand);

/** The theme for a brand colour; null is the app's own indigo. */
export function buildTheme(dark: boolean, brandColor: string | null): AppTheme {
  if (!brandColor) return dark ? darkTheme : lightTheme;
  const brand = brandRamp(brandColor);
  return dark ? createAppDarkTheme(brand) : createAppLightTheme(brand);
}

/** The colour an accent setting stands for; null is the app's indigo (also when Windows gives none). */
export function accentColor(accent: Accent | undefined, systemAccent: string | null): string | null {
  if (accent === "system") return systemAccent;
  return accent && accent !== "app" ? accent : null;
}

/** The app's current theme from the theme and accent settings. */
export function useAppTheme(): { theme: AppTheme; dark: boolean } {
  const dark = useIsDark(useSettings((s) => s.settings?.theme ?? "system"));
  const accent = useSettings((s) => s.settings?.accent);
  const systemAccent = useUi((s) => s.systemAccent);
  const color = accentColor(accent, systemAccent);
  return useMemo(() => ({ dark, theme: buildTheme(dark, color) }), [dark, color]);
}

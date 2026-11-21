import { useEffect, useState } from "react";
import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from "@fluentui/react-components";
import type { ThemePreference } from "../lib/types";

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
const brand: BrandVariants = {
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

// Windows 11 layering: window base (navigation) → content layer → cards, each a step lighter in dark mode.
// Background1 is what Fluent paints inputs, buttons, menus and dialogs with, so it sits one step above the cards.
// Background4* is what Fluent's Nav components paint on, so it matches the window base.
export const darkTheme: AppTheme = {
  ...createDarkTheme(brand),
  colorBrandForeground1: brand[110],
  colorBrandForeground2: brand[120],
  colorBrandForegroundLink: brand[110],
  fontFamilyBase,
  fontFamilyDisplay,
  colorAppLayer: "#242424",
  colorAppLayerMica: "rgba(58, 58, 58, 0.3)",
  colorNeutralCardBackground: "#2c2c2c",
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

export const lightTheme: AppTheme = {
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

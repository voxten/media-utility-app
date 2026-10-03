import { useEffect, useState } from "react";
import { webDarkTheme, webLightTheme, type Theme } from "@fluentui/react-components";
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

// Windows 11-like surfaces: a darker window base with the content on a lighter "layer".
// Background4* is what Fluent's Nav components paint on, so it matches the window base.
export const darkTheme: Theme = {
  ...webDarkTheme,
  colorNeutralBackground1: "#272727",
  colorNeutralBackground2: "#202020",
  colorNeutralBackground3: "#1c1c1c",
  colorNeutralBackground4: "#202020",
  colorNeutralBackground4Hover: "#2d2d2d",
  colorNeutralBackground4Pressed: "#292929",
  colorNeutralBackground4Selected: "#2d2d2d",
};

export const lightTheme: Theme = {
  ...webLightTheme,
  colorNeutralBackground2: "#f3f3f3",
  colorNeutralBackground3: "#eeeeee",
  colorNeutralBackground4: "#f3f3f3",
  colorNeutralBackground4Hover: "#e9e9e9",
  colorNeutralBackground4Pressed: "#e4e4e4",
  colorNeutralBackground4Selected: "#e9e9e9",
};

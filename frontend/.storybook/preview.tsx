import { useEffect, type ReactNode } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import { FluentProvider, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import i18n from "../src/i18n";
import { ACCENT_PRESETS, appTokens, buildTheme } from "../src/app/theme";
import "../src/global.css";
import "./preview.css";

const useStyles = makeStyles({
  // Same surface as the app's content area (Shell), so panels sit on the colour they do in the app.
  canvas: {
    minHeight: "100vh",
    padding: "32px",
    boxSizing: "border-box",
    backgroundColor: appTokens.colorAppLayer,
    color: tokens.colorNeutralForeground1,
  },
  page: { height: "100vh", padding: 0 },
  // Docs pages stack every story, so each one only takes the room it needs.
  docs: { minHeight: "auto" },
  docsPage: { height: "640px" },
});

interface SurfaceProps {
  page: boolean;
  docs: boolean;
  locale: string;
  children: ReactNode;
}

function Surface({ page, docs, locale, children }: SurfaceProps) {
  const styles = useStyles();
  useEffect(() => {
    if (i18n.language !== locale) i18n.changeLanguage(locale);
  }, [locale]);
  return (
    <div className={mergeClasses(styles.canvas, page && styles.page, docs && styles.docs, docs && page && styles.docsPage)}>
      {children}
    </div>
  );
}

const withAppProviders: Decorator = (Story, context) => {
  const dark = context.globals.theme !== "light";
  const accent: string = context.globals.accent ?? "app";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return (
    <FluentProvider theme={buildTheme(dark, accent === "app" ? null : accent)}>
      <Surface page={context.parameters.surface === "page"} docs={context.viewMode === "docs"} locale={context.globals.locale ?? "pl"}>
        <Story />
      </Surface>
    </FluentProvider>
  );
};

const preview: Preview = {
  decorators: [withAppProviders],
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
  globalTypes: {
    accent: {
      description: "Accent colour",
      toolbar: {
        title: "Accent",
        icon: "paintbrush",
        items: [
          { value: "app", title: "Indigo (app)" },
          ...Object.entries(ACCENT_PRESETS).map(([name, color]) => ({ value: color, title: name })),
          { value: "#ffff00", title: "yellow (contrast check)" },
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      description: "App theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: "UI language",
      toolbar: {
        title: "Language",
        icon: "globe",
        items: [
          { value: "pl", title: "Polski" },
          { value: "en", title: "English" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "dark", locale: "pl", accent: "app" },
};

export default preview;

import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { makeStyles, Spinner, tokens, Toaster } from "@fluentui/react-components";
import { ConfirmHost } from "../components/ConfirmDialog";
import { TOASTER_ID } from "../components/notify";
import { useRoute } from "../lib/router";
import { Navigation } from "./Navigation";

const HomePage = lazy(() => import("../features/home/HomePage"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage"));

const TOOL_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  converter: lazy(() => import("../features/converter/ConverterPage")),
  pdf: lazy(() => import("../features/pdf/PdfPage")),
  duplicates: lazy(() => import("../features/duplicates/DuplicatesPage")),
  tts: lazy(() => import("../features/tts/TtsPage")),
  download: lazy(() => import("../features/download/DownloadPage")),
  watermark: lazy(() => import("../features/watermark/WatermarkPage")),
  progress: lazy(() => import("../features/progress/ProgressPage")),
};

const NAV_COLLAPSED_KEY = "nav-collapsed";

const useStyles = makeStyles({
  shell: {
    display: "flex",
    height: "100vh",
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
  },
  content: {
    flexGrow: 1,
    minWidth: 0,
    marginTop: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopLeftRadius: tokens.borderRadiusXLarge,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    borderLeft: `1px solid ${tokens.colorNeutralStroke3}`,
    overflow: "hidden",
    position: "relative",
  },
  loading: { height: "100%", display: "grid", placeItems: "center" },
});

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function PageForRoute({ route }: { route: string }) {
  if (route === "home") return <HomePage />;
  if (route === "settings") return <SettingsPage />;
  const ToolPage = TOOL_PAGES[route];
  return ToolPage ? <ToolPage /> : <HomePage />;
}

export function Shell() {
  const styles = useStyles();
  const route = useRoute();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  return (
    <div className={styles.shell}>
      <Navigation route={route} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className={styles.content}>
        <Suspense
          fallback={
            <div className={styles.loading}>
              <Spinner />
            </div>
          }
        >
          <PageForRoute key={route} route={route} />
        </Suspense>
      </main>
      <Toaster toasterId={TOASTER_ID} position="top-end" offset={{ vertical: 16 }} pauseOnHover />
      <ConfirmHost />
    </div>
  );
}

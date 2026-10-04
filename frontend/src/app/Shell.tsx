import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { makeStyles, mergeClasses, Spinner, tokens, Toaster } from "@fluentui/react-components";
import { ConfirmHost } from "../components/ConfirmDialog";
import { TransferModal } from "../components/TransferModal";
import { TOASTER_ID } from "../components/notify";
import { useRoute } from "../lib/router";
import { useUi } from "../stores/ui";
import { CommandPalette } from "./CommandPalette";
import { JobsPanel } from "./JobsPanel";
import { JobsPopup } from "./JobsPopup";
import { Navigation } from "./Navigation";
import { useJobNotifications } from "./useJobNotifications";

const HomePage = lazy(() => import("../features/home/HomePage"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage"));

const TOOL_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  compressor: lazy(() => import("../features/compressor/CompressorPage")),
  image_tools: lazy(() => import("../features/image_tools/ImageToolsPage")),
  converter: lazy(() => import("../features/converter/ConverterPage")),
  rembg: lazy(() => import("../features/rembg/RemBgPage")),
  upscale: lazy(() => import("../features/upscale/UpscalePage")),
  pdf: lazy(() => import("../features/pdf/PdfPage")),
  pdf_compress: lazy(() => import("../features/pdf/PdfCompressPage")),
  pdf_split: lazy(() => import("../features/pdf/PdfSplitPage")),
  pdf_convert: lazy(() => import("../features/pdf/PdfConvertPage")),
  pdf_extract: lazy(() => import("../features/pdf/PdfExtractPage")),
  duplicates: lazy(() => import("../features/duplicates/DuplicatesPage")),
  tts: lazy(() => import("../features/tts/TtsPage")),
  download: lazy(() => import("../features/download/DownloadPage")),
  video_sync: lazy(() => import("../features/video_sync/VideoSyncPage")),
  watermark: lazy(() => import("../features/watermark/WatermarkPage")),
  progress: lazy(() => import("../features/progress/ProgressPage")),
};

const NAV_COLLAPSED_KEY = "nav-collapsed";

// Overrides of the tokens Fluent's Nav paints with, scoped to the shell (portals unaffected).
const MICA_TOKENS = {
  "--colorNeutralBackground4": "transparent",
  "--colorNeutralBackground4Hover": "rgba(128, 128, 128, 0.12)",
  "--colorNeutralBackground4Pressed": "rgba(128, 128, 128, 0.18)",
  "--colorNeutralBackground4Selected": "rgba(128, 128, 128, 0.14)",
} as React.CSSProperties;

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
  // Mica: transparent base; nav surfaces become translucent overlays instead of solid greys.
  mica: { backgroundColor: "transparent" },
  loading: { height: "100%", display: "grid", placeItems: "center" },
  // Subtle WinUI-like page entrance; disabled by prefers-reduced-motion in global.css.
  page: {
    height: "100%",
    animationName: { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "none" } },
    animationDuration: tokens.durationNormal,
    animationTimingFunction: tokens.curveDecelerateMid,
  },
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
  const mica = useUi((s) => s.mica);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  useJobNotifications(route);

  // Ctrl+K anywhere opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUi.getState().setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={mergeClasses(styles.shell, mica && styles.mica)} style={mica ? MICA_TOKENS : undefined}>
      <Navigation route={route} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className={styles.content}>
        <Suspense
          fallback={
            <div className={styles.loading}>
              <Spinner />
            </div>
          }
        >
          <div key={route} className={styles.page}>
            <PageForRoute route={route} />
          </div>
        </Suspense>
      </main>
      <Toaster toasterId={TOASTER_ID} position="top-end" offset={{ vertical: 16 }} pauseOnHover />
      <ConfirmHost />
      <TransferModal />
      <JobsPanel />
      <JobsPopup collapsed={collapsed} />
      <CommandPalette />
    </div>
  );
}

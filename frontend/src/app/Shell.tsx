import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { useTranslation } from "react-i18next";
import { makeStyles, mergeClasses, Spinner, tokens, Toaster } from "@fluentui/react-components";
import { ConfirmHost } from "../components/ConfirmDialog";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { EngineUpdateHost } from "../components/EngineUpdateHost";
import { DropOverlay } from "../components/DropOverlay";
import { useClipboardLinks } from "../lib/clipboardLink";
import { TransferModal } from "../components/TransferModal";
import { WhatsNewHost } from "../components/WhatsNewDialog";
import { TOASTER_ID } from "../components/notify";
import { navigate, useRoute } from "../lib/router";
import { useRecentTools } from "../stores/recentTools";
import { useUi } from "../stores/ui";
import { CommandPalette } from "./CommandPalette";
import { JobsPopup } from "./JobsPopup";
import { Navigation } from "./Navigation";
import { appTokens } from "./theme";
import { toolById } from "./tools";
import { useJobNotifications } from "./useJobNotifications";
import { useTaskbarProgress } from "./useTaskbarProgress";

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
  transcribe: lazy(() => import("../features/transcribe/TranscribePage")),
  download: lazy(() => import("../features/download/DownloadPage")),
  instagram: lazy(() => import("../features/instagram/InstagramPage")),
  video_sync: lazy(() => import("../features/video_sync/VideoSyncPage")),
  video_to_gif: lazy(() => import("../features/gif/VideoToGifPage")),
  media_convert: lazy(() => import("../features/media_convert/MediaConvertPage")),
  gif_editor: lazy(() => import("../features/gif/GifEditorPage")),
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
    backgroundColor: appTokens.colorAppLayer,
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
  const { t } = useTranslation();
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
  useTaskbarProgress();
  useClipboardLinks();

  useEffect(() => {
    if (toolById(route)) useRecentTools.getState().remember(route);
  }, [route]);

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
            <ErrorBoundary
              actions={(reset) => [
                { label: t("errors.retry"), onClick: reset },
                ...(route === "home" ? [] : [{ label: t("errors.goHome"), onClick: () => navigate("home") }]),
              ]}
            >
              <PageForRoute route={route} />
            </ErrorBoundary>
          </div>
        </Suspense>
      </main>
      <Toaster toasterId={TOASTER_ID} position="top-end" offset={{ vertical: 16 }} pauseOnHover />
      <ConfirmHost />
      <TransferModal />
      <DropOverlay />
      <WhatsNewHost />
      <EngineUpdateHost />
      <JobsPopup collapsed={collapsed} />
      <CommandPalette />
    </div>
  );
}

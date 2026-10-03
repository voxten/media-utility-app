import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { makeStyles, Spinner, tokens, Toaster } from "@fluentui/react-components";
import { useRoute } from "../lib/router";
import { Navigation } from "./Navigation";
import { toolById } from "./tools";

const HomePage = lazy(() => import("../features/home/HomePage"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage"));
const ComingSoon = lazy(() => import("../features/ComingSoon"));

// Tool pages are registered here as they are ported (phase 4).
const TOOL_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {};

export const TOASTER_ID = "app-toaster";
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
  if (ToolPage) return <ToolPage />;
  const tool = toolById(route);
  return tool ? <ComingSoon toolId={tool.id} /> : <HomePage />;
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
      <Toaster toasterId={TOASTER_ID} position="bottom-end" pauseOnHover />
    </div>
  );
}

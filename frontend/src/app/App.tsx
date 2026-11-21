import { useEffect, useState } from "react";
import { FluentProvider, makeStyles, Spinner, tokens } from "@fluentui/react-components";
import { MotionBehaviourProvider } from "@fluentui/react-motion";
import { useTranslation } from "react-i18next";
import { ErrorBoundary, ErrorScreen } from "../components/ErrorBoundary";
import i18n from "../i18n";
import { api, on, ready } from "../lib/bridge";
import { openClipboardLink } from "../lib/clipboardLink";
import { errorMessage, installGlobalErrorReporting } from "../lib/errors";
import { initJobEvents, useJobs } from "../stores/jobs";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { Shell } from "./Shell";
import { useAppTheme } from "./theme";

const useStyles = makeStyles({
  splash: { height: "100vh", display: "grid", placeItems: "center", backgroundColor: tokens.colorNeutralBackground2 },
});

/** Longer than any normal start; past it the backend is stuck and waiting longer will not help. */
const BOOT_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(i18n.t("errors.bootTimeout"))), ms);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

async function boot(load: () => Promise<unknown>) {
  installGlobalErrorReporting();
  const mode = await ready;
  initJobEvents(); // subscribe before the backend starts delivering events
  on("app:mica", ({ active }) => useUi.setState({ mica: active }));
  on("clipboard:link", openClipboardLink); // a link that started the app arrives right after ready()
  useJobs.getState().loadHistory().catch(() => undefined);
  await Promise.all([load(), useUi.getState().refreshSystemAccent()]); // both before the first paint, so the accent does not flash
  if (mode === "native") {
    const info = await api.app.ready();
    useUi.setState({
      mica: !!info.mica,
      micaSupported: !!info.micaSupported,
      hotkeyTaken: info.hotkeyTaken ? (useSettings.getState().settings?.globalHotkey ?? "") : "",
    });
  }
}

export function App() {
  const styles = useStyles();
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const load = useSettings((s) => s.load);
  const [bootError, setBootError] = useState<string | null>(null);
  const { theme, dark } = useAppTheme();
  const mica = useUi((s) => s.mica);

  useEffect(() => {
    withTimeout(boot(load), BOOT_TIMEOUT_MS).catch((err) => setBootError(errorMessage(i18n.t, err)));
  }, [load]);

  const language = settings?.language;
  useEffect(() => {
    if (!language) return;
    i18n.changeLanguage(language);
    document.documentElement.lang = language;
    api.app
      .setShellLabels({
        open: i18n.t("shell.open"),
        quit: i18n.t("shell.quit"),
        backgroundTitle: i18n.t("shell.backgroundTitle"),
        backgroundBody: i18n.t("shell.backgroundBody"),
        quitConfirmTitle: i18n.t("shell.quitConfirmTitle"),
        quitConfirmBody: i18n.t("shell.quitConfirmBody"),
        clipboard: i18n.t("shell.clipboard"),
        clipboardEmpty: i18n.t("shell.clipboardEmpty"),
      })
      .catch(() => undefined);
  }, [language]);

  // A changed Windows accent shows once the user comes back to the window.
  const followsWindows = settings?.accent === "system";
  useEffect(() => {
    if (!followsWindows) return;
    const refresh = () => void useUi.getState().refreshSystemAccent();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [followsWindows]);

  const animations = settings?.animations ?? true;
  useEffect(() => {
    if (animations) delete document.documentElement.dataset.motion;
    else document.documentElement.dataset.motion = "off";
  }, [animations]);

  useEffect(() => {
    // With Mica the window base must stay transparent so DWM's backdrop shows through.
    document.body.style.backgroundColor = mica ? "transparent" : theme.colorNeutralBackground2;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    api.app.setTitleBarTheme(dark).catch(() => undefined);
  }, [dark, theme, mica]);

  return (
    <FluentProvider theme={theme}>
      <MotionBehaviourProvider value={animations ? "default" : "skip"}>
        {settings ? (
          <ErrorBoundary actions={() => [{ label: t("errors.reload"), onClick: () => window.location.reload() }]}>
            <Shell />
          </ErrorBoundary>
        ) : (
          <div className={styles.splash}>
            {bootError ? (
              <ErrorScreen
                message={t("errors.bootFailed", { error: bootError })}
                actions={[{ label: t("errors.reload"), onClick: () => window.location.reload() }]}
              />
            ) : (
              <Spinner />
            )}
          </div>
        )}
      </MotionBehaviourProvider>
    </FluentProvider>
  );
}

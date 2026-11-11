import { useEffect, useState } from "react";
import { FluentProvider, makeStyles, Spinner, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { ErrorBoundary, ErrorScreen } from "../components/ErrorBoundary";
import i18n from "../i18n";
import { api, on, ready } from "../lib/bridge";
import { errorMessage, installGlobalErrorReporting } from "../lib/errors";
import { initJobEvents, useJobs } from "../stores/jobs";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { Shell } from "./Shell";
import { darkTheme, lightTheme, useIsDark } from "./theme";

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
  useJobs.getState().loadHistory().catch(() => undefined);
  await load();
  if (mode === "native") {
    const info = await api.app.ready();
    useUi.setState({ mica: !!info.mica, micaSupported: !!info.micaSupported });
  }
}

export function App() {
  const styles = useStyles();
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const load = useSettings((s) => s.load);
  const [bootError, setBootError] = useState<string | null>(null);
  const dark = useIsDark(settings?.theme ?? "system");
  const mica = useUi((s) => s.mica);
  const theme = dark ? darkTheme : lightTheme;

  useEffect(() => {
    withTimeout(boot(load), BOOT_TIMEOUT_MS).catch((err) => setBootError(errorMessage(i18n.t, err)));
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
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
  }, [settings?.language]);

  useEffect(() => {
    // With Mica the window base must stay transparent so DWM's backdrop shows through.
    document.body.style.backgroundColor = mica ? "transparent" : theme.colorNeutralBackground2;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    api.app.setTitleBarTheme(dark).catch(() => undefined);
  }, [dark, theme, mica]);

  return (
    <FluentProvider theme={theme}>
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
    </FluentProvider>
  );
}

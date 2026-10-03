import { useEffect, useState } from "react";
import { FluentProvider, makeStyles, Spinner, tokens } from "@fluentui/react-components";
import i18n from "../i18n";
import { api, on, ready } from "../lib/bridge";
import { initJobEvents } from "../stores/jobs";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { Shell } from "./Shell";
import { darkTheme, lightTheme, useIsDark } from "./theme";

const useStyles = makeStyles({
  splash: { height: "100vh", display: "grid", placeItems: "center", backgroundColor: tokens.colorNeutralBackground2 },
});

async function boot(load: () => Promise<unknown>) {
  const mode = await ready;
  initJobEvents(); // subscribe before the backend starts delivering events
  on("app:mica", ({ active }) => useUi.setState({ mica: active }));
  await load();
  if (mode === "native") {
    const info = await api.app.ready();
    useUi.setState({ mica: !!info.mica, micaSupported: !!info.micaSupported });
  }
}

export function App() {
  const styles = useStyles();
  const settings = useSettings((s) => s.settings);
  const load = useSettings((s) => s.load);
  const [bootError, setBootError] = useState<string | null>(null);
  const dark = useIsDark(settings?.theme ?? "system");
  const mica = useUi((s) => s.mica);
  const theme = dark ? darkTheme : lightTheme;

  useEffect(() => {
    boot(load).catch((err) => setBootError(String(err)));
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
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
        <Shell />
      ) : (
        <div className={styles.splash}>
          <Spinner label={bootError ?? undefined} />
        </div>
      )}
    </FluentProvider>
  );
}

// Ctrl+K quick switcher: tools, pages and a few app actions, fully keyboard driven.

import { useEffect, useMemo, useRef, useState } from "react";
import { Caption1, Dialog, DialogSurface, Input, makeStyles, mergeClasses, Text, tokens } from "@fluentui/react-components";
import {
  DarkTheme24Regular,
  Home24Regular,
  LocalLanguage24Regular,
  Search20Regular,
  Settings24Regular,
  TaskListLtr24Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { navigate } from "../lib/router";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { TOOLS } from "./tools";

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  icon: FluentIcon;
  accent?: string;
  keywords: string;
  run: () => void;
}

const useStyles = makeStyles({
  surface: { padding: "0", width: "560px", maxWidth: "calc(100vw - 32px)", overflow: "hidden", alignSelf: "start", marginTop: "12vh" },
  search: { padding: "12px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  input: { width: "100%" },
  list: { maxHeight: "50vh", overflowY: "auto", padding: "6px" },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
  },
  active: { backgroundColor: tokens.colorSubtleBackgroundHover },
  tile: {
    width: "32px",
    height: "32px",
    borderRadius: tokens.borderRadiusMedium,
    display: "grid",
    placeItems: "center",
    color: "#fff",
    flexShrink: 0,
    "& svg": { width: "18px", height: "18px" },
  },
  plainTile: { color: tokens.colorNeutralForeground2, backgroundColor: tokens.colorNeutralBackground3 },
  texts: { display: "flex", flexDirection: "column", minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground3 },
  empty: { padding: "20px", textAlign: "center", color: tokens.colorNeutralForeground3 },
  footer: { display: "flex", gap: "16px", padding: "8px 14px", borderTop: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground3 },
  kbd: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    padding: "1px 5px",
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    marginRight: "4px",
  },
});

export function CommandPalette() {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const setJobsPopupOpen = useUi((s) => s.setJobsPopupOpen);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (route: string) => () => navigate(route);
    const nextTheme = settings?.theme === "dark" ? "light" : settings?.theme === "light" ? "system" : "dark";
    const nextLang = settings?.language === "pl" ? "en" : "pl";
    return [
      { id: "home", title: t("nav.home"), icon: Home24Regular, keywords: "home start", run: go("home") },
      ...TOOLS.map((tool) => ({
        id: tool.id,
        title: t(`tools.${tool.id}.name`),
        subtitle: t(`tools.${tool.id}.description`),
        icon: tool.icon,
        accent: tool.accent,
        keywords: `${tool.id} ${t(`categories.${tool.category}`)}`,
        run: go(tool.id),
      })),
      { id: "settings", title: t("nav.settings"), icon: Settings24Regular, keywords: "settings ustawienia", run: go("settings") },
      { id: "jobs", title: t("palette.showJobs"), icon: TaskListLtr24Regular, keywords: "jobs zadania tasks", run: () => setJobsPopupOpen(true) },
      {
        id: "theme",
        title: t("palette.theme", { theme: t(`settings.themes.${nextTheme}`) }),
        icon: DarkTheme24Regular,
        keywords: "theme motyw dark light ciemny jasny",
        run: () => update({ theme: nextTheme }),
      },
      {
        id: "language",
        title: t("palette.language", { language: nextLang === "pl" ? "Polski" : "English" }),
        icon: LocalLanguage24Regular,
        keywords: "language język polski english",
        run: () => update({ language: nextLang }),
      },
    ];
  }, [t, settings?.theme, settings?.language, setJobsPopupOpen, update]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.title} ${c.subtitle ?? ""} ${c.keywords}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface className={styles.surface} aria-label={t("palette.title")}>
        <div className={styles.search}>
          <Input
            className={styles.input}
            appearance="filled-lighter"
            size="large"
            autoFocus
            contentBefore={<Search20Regular />}
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(_, d) => setQuery(d.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(results[active]);
              }
            }}
          />
        </div>
        <div className={styles.list} ref={listRef} role="listbox">
          {results.length === 0 && <div className={styles.empty}>{t("palette.noResults")}</div>}
          {results.map((c, i) => (
            <div
              key={c.id}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={mergeClasses(styles.item, i === active && styles.active)}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span
                className={mergeClasses(styles.tile, !c.accent && styles.plainTile)}
                style={c.accent ? { background: `linear-gradient(135deg, ${c.accent}, ${c.accent}bb)` } : undefined}
              >
                <c.icon />
              </span>
              <div className={styles.texts}>
                <Text weight="semibold">{c.title}</Text>
                {c.subtitle && <Caption1 className={styles.muted}>{c.subtitle}</Caption1>}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <Caption1>
            <span className={styles.kbd}>↑↓</span>
            {t("palette.navigate")}
          </Caption1>
          <Caption1>
            <span className={styles.kbd}>Enter</span>
            {t("palette.open")}
          </Caption1>
          <Caption1>
            <span className={styles.kbd}>Esc</span>
            {t("common.close")}
          </Caption1>
        </div>
      </DialogSurface>
    </Dialog>
  );
}

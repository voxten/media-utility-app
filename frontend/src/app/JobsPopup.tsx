// Floating jobs popup anchored to the navigation rail: this session's jobs and the saved history, in two tabs.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Caption1,
  Caption1Strong,
  CounterBadge,
  makeStyles,
  Menu,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  mergeClasses,
  SearchBox,
  Tab,
  TabList,
  Tag,
  TagGroup,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  Delete16Regular,
  Dismiss16Regular,
  Filter16Filled,
  Filter16Regular,
  History16Regular,
  History24Regular,
  TaskListLtr20Regular,
  TaskListLtr24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { confirm } from "../components/ConfirmDialog";
import { JobCard } from "../components/JobCard";
import { translateMessage } from "../lib/jobMessage";
import type { HistoryEntry } from "../lib/types";
import { historyJob, listedJobs, useJobs } from "../stores/jobs";
import { useUi, type JobsTab } from "../stores/ui";
import { ALL, EMPTY_FILTER, filterHistory, groupByDay, historyFacets, type HistoryFilter } from "./historyFilter";
import { toolById } from "./tools";

/** Search and filters appear once the history is long enough to need them. */
const HISTORY_FILTER_MIN = 6;

const useStyles = makeStyles({
  popup: {
    position: "fixed",
    bottom: "16px",
    zIndex: 990,
    width: "420px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "min(580px, calc(100vh - 32px))",
    display: "flex",
    flexDirection: "column",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow28,
    overflow: "hidden",
    animationName: {
      from: { opacity: 0, transform: "translateY(10px) scale(0.98)" },
      to: { opacity: 1, transform: "none" },
    },
    animationDuration: tokens.durationNormal,
    animationTimingFunction: tokens.curveDecelerateMid,
    transitionProperty: "left",
    transitionDuration: tokens.durationGentle,
    transitionTimingFunction: tokens.curveEasyEase,
  },
  popupFixedHeight: {
    height: "min(580px, calc(100vh - 32px))",
  },
  mica: {
    backdropFilter: "blur(24px)",
    backgroundColor: tokens.colorNeutralBackgroundAlpha2,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 10px 6px 16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tabs: {
    flexGrow: 1,
    minWidth: 0,
  },
  tabCount: {
    marginLeft: "6px",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px",
    overflowY: "auto",
    maxHeight: "460px",
    scrollbarWidth: "thin",
    scrollbarGutter: "stable",
  },
  bodyFill: {
    flexGrow: 1,
    minHeight: 0,
    maxHeight: "none",
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "32px 16px",
    textAlign: "center",
    flexGrow: 1,
  },
  filterHead: {
    position: "sticky",
    top: "-14px",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    margin: "-14px -14px 0",
    padding: "14px 14px 6px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  filterHeadMica: {
    backdropFilter: "blur(24px)",
    backgroundColor: tokens.colorNeutralBackgroundAlpha2,
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  filterSearch: {
    flexGrow: 1,
    maxWidth: "none",
  },
  filterActive: {
    color: tokens.colorBrandForeground1,
  },
  spreadRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  dayGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  dayHeading: {
    paddingTop: "4px",
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "4px",
    padding: "10px 14px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerIconRunning: { color: tokens.colorPaletteBlueForeground2 },
  emptyIcon: { fontSize: "32px" },
});

export function JobsPopup({ collapsed }: { collapsed: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = useUi((s) => s.jobsPopupOpen);
  const setPopupOpen = useUi((s) => s.setJobsPopupOpen);
  const tab = useUi((s) => s.jobsTab);
  const setTab = useUi((s) => s.setJobsTab);
  const mica = useUi((s) => s.mica);

  const popupRef = useRef<HTMLDivElement>(null);

  const jobs = useJobs(useShallow(listedJobs));
  const runningCount = jobs.filter((j) => j.status === "running").length;
  const finishedCount = jobs.length - runningCount;
  const clearFinished = useJobs((s) => s.clearFinished);
  const history = useJobs((s) => s.history);
  const hasHistory = history.length > 0;

  // Opening the popup shows this session's jobs when there are any; otherwise the tab last chosen.
  const hasSessionJobs = useRef(false);
  hasSessionJobs.current = jobs.length > 0;
  useEffect(() => {
    if (open && hasSessionJobs.current) setTab("now");
  }, [open, setTab]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopupOpen(false);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        // The rail button toggles the popup itself; closing here too would reopen it.
        // Menus and dialogs opened from the popup render in Fluent portals outside it.
        const target = e.target as HTMLElement;
        if (target.closest("[data-jobs-trigger], [data-portal-node]")) return;
        setPopupOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, setPopupOpen]);

  if (!open) return null;

  const close = () => setPopupOpen(false);
  const leftPosition = collapsed ? "68px" : "284px";

  return (
    <div
      ref={popupRef}
      // A fixed height keeps the bottom-anchored popup from jumping when switching tabs or filtering.
      className={mergeClasses(styles.popup, hasHistory && styles.popupFixedHeight, mica && styles.mica)}
      style={{ left: leftPosition }}
      role="dialog"
      aria-label={t("jobs.title")}
    >
      <div className={styles.header}>
        <TaskListLtr20Regular className={runningCount > 0 ? styles.headerIconRunning : undefined} />
        <Text weight="semibold">{t("jobs.title")}</Text>
        <TabList
          size="small"
          className={styles.tabs}
          selectedValue={tab}
          onTabSelect={(_, d) => setTab(d.value as JobsTab)}
        >
          <Tab value="now">
            {t("jobs.tabNow")}
            {runningCount > 0 && (
              <Tooltip content={t("jobs.activeCount", { count: runningCount })} relationship="label">
                <CounterBadge className={styles.tabCount} size="small" appearance="filled" count={runningCount} />
              </Tooltip>
            )}
          </Tab>
          <Tab value="history">{t("jobs.tabHistory")}</Tab>
        </TabList>
        <Tooltip content={t("common.close")} relationship="label">
          <Button size="small" appearance="subtle" icon={<Dismiss16Regular />} onClick={close} aria-label={t("common.close")} />
        </Tooltip>
      </div>

      {tab === "now" ? (
        <>
          <div className={mergeClasses(styles.body, hasHistory && styles.bodyFill)}>
            {jobs.length === 0 ? (
              <div className={styles.empty}>
                <TaskListLtr24Regular className={mergeClasses(styles.muted, styles.emptyIcon)} />
                <Text weight="semibold">{t("jobs.noSessionJobs")}</Text>
                {hasHistory && (
                  <Button size="small" appearance="subtle" icon={<History16Regular />} onClick={() => setTab("history")}>
                    {t("jobs.showHistory")}
                  </Button>
                )}
              </div>
            ) : (
              jobs.map((job) => <JobCard key={job.id} job={job} onNavigate={close} />)
            )}
          </div>
          {finishedCount > 0 && (
            <div className={styles.footer}>
              <Button size="small" appearance="subtle" icon={<Delete16Regular />} onClick={clearFinished}>
                {t("jobs.clearFinished")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <HistoryTab history={history} onNavigate={close} />
      )}
    </div>
  );
}

function HistoryTab({ history, onNavigate }: { history: HistoryEntry[]; onNavigate: () => void }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const mica = useUi((s) => s.mica);
  const liveJobs = useJobs((s) => s.jobs);
  const clearHistory = useJobs((s) => s.clearHistory);

  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);
  const setFilterField = (patch: Partial<HistoryFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const showFilter = history.length >= HISTORY_FILTER_MIN;
  const facets = useMemo(() => historyFacets(history), [history]);
  const shown = useMemo(
    () => (showFilter ? filterHistory(history, filter, (entry) => translateMessage(t, entry.title)) : history),
    [history, filter, showFilter, t],
  );
  const groups = useMemo(() => groupByDay(shown), [shown]);
  const filtered = showFilter && (filter.query.trim() !== "" || filter.tool !== ALL || filter.status !== ALL);
  const menuFiltered = filter.tool !== ALL || filter.status !== ALL;
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }), [i18n.language]);

  const askClearHistory = async () => {
    const ok = await confirm({ title: t("jobs.clearHistoryTitle"), body: t("jobs.clearHistoryBody"), confirmLabel: t("jobs.clearHistory"), danger: true });
    if (ok) clearHistory().catch(() => undefined);
  };

  const dayLabel = (day: string, date: Date) =>
    day === "today" ? t("jobs.today") : day === "yesterday" ? t("jobs.yesterday") : dayFormat.format(date);

  return (
    <>
      <div className={mergeClasses(styles.body, styles.bodyFill)}>
        {history.length === 0 && (
          <div className={styles.empty}>
            <History24Regular className={mergeClasses(styles.muted, styles.emptyIcon)} />
            <Text weight="semibold">{t("jobs.historyEmpty")}</Text>
          </div>
        )}
        {showFilter && (
          <div className={mergeClasses(styles.filterHead, mica && styles.filterHeadMica)}>
            <div className={styles.filterRow}>
              <SearchBox
                size="small"
                className={styles.filterSearch}
                placeholder={t("jobs.searchHistory")}
                aria-label={t("jobs.searchHistory")}
                value={filter.query}
                onChange={(_, d) => setFilterField({ query: d.value })}
              />
              <Menu
                checkedValues={{ tool: [filter.tool], status: [filter.status] }}
                onCheckedValueChange={(_, { name, checkedItems }) => {
                  const value = checkedItems[0] ?? ALL;
                  if (name === "tool") setFilterField({ tool: value });
                  else setFilterField({ status: facets.statuses.find((s) => s === value) ?? ALL });
                }}
              >
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip content={t("jobs.filter")} relationship="label">
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={menuFiltered ? <Filter16Filled className={styles.filterActive} /> : <Filter16Regular />}
                    />
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuGroup>
                      <MenuGroupHeader>{t("jobs.filterTool")}</MenuGroupHeader>
                      <MenuItemRadio name="tool" value={ALL}>
                        {t("jobs.anyTool")}
                      </MenuItemRadio>
                      {facets.tools.map((id) => {
                        const Icon = toolById(id)?.icon;
                        return (
                          <MenuItemRadio key={id} name="tool" value={id} icon={Icon && <Icon />}>
                            {t(`tools.${id}.name`)}
                          </MenuItemRadio>
                        );
                      })}
                    </MenuGroup>
                    <MenuDivider />
                    <MenuGroup>
                      <MenuGroupHeader>{t("jobs.filterStatus")}</MenuGroupHeader>
                      <MenuItemRadio name="status" value={ALL}>
                        {t("jobs.anyStatus")}
                      </MenuItemRadio>
                      {facets.statuses.map((status) => (
                        <MenuItemRadio key={status} name="status" value={status}>
                          {t(`common.jobStatus.${status}`)}
                        </MenuItemRadio>
                      ))}
                    </MenuGroup>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
            {filtered && (
              <div className={styles.spreadRow}>
                <TagGroup
                  size="extra-small"
                  onDismiss={(_, { value }) => setFilterField(value === "tool" ? { tool: ALL } : { status: ALL })}
                >
                  {filter.tool !== ALL && (
                    <Tag value="tool" dismissible dismissIcon={{ "aria-label": t("jobs.removeFilter") }}>
                      {t(`tools.${filter.tool}.name`)}
                    </Tag>
                  )}
                  {filter.status !== ALL && (
                    <Tag value="status" dismissible dismissIcon={{ "aria-label": t("jobs.removeFilter") }}>
                      {t(`common.jobStatus.${filter.status}`)}
                    </Tag>
                  )}
                </TagGroup>
                <Caption1 className={styles.muted}>
                  {t("jobs.historyCount", { shown: shown.length, total: history.length })}
                </Caption1>
              </div>
            )}
          </div>
        )}
        {history.length > 0 && shown.length === 0 && (
          <div className={styles.spreadRow}>
            <Caption1 className={styles.muted}>{t("jobs.noHistoryMatches")}</Caption1>
            <Button size="small" appearance="subtle" onClick={() => setFilter(EMPTY_FILTER)}>
              {t("jobs.clearFilters")}
            </Button>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.day} className={styles.dayGroup}>
            <Caption1Strong className={styles.dayHeading}>{dayLabel(group.day, group.date)}</Caption1Strong>
            {group.entries.map((entry) => {
              const live = liveJobs[entry.id];
              return live ? (
                <JobCard key={entry.id} job={live} when="time" onNavigate={onNavigate} />
              ) : (
                <JobCard key={entry.id} job={historyJob(entry)} saved={entry} when="time" onNavigate={onNavigate} />
              );
            })}
          </div>
        ))}
      </div>
      {history.length > 0 && (
        <div className={styles.footer}>
          <Button size="small" appearance="subtle" icon={<History16Regular />} onClick={askClearHistory}>
            {t("jobs.clearHistory")}
          </Button>
        </div>
      )}
    </>
  );
}

// Floating corner popup showing active tasks: overall progress & individual actions.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  ProgressBar,
  Spinner,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  CheckmarkCircle16Filled,
  ChevronDown16Regular,
  Clock16Regular,
  Delete16Regular,
  Dismiss16Regular,
  DismissCircle16Filled,
  Open16Regular,
  SubtractCircle16Filled,
  TaskListLtr20Regular,
  TaskListLtr24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { jobMessage } from "../components/JobStatusBadge";
import { LiveElapsed } from "../components/LiveElapsed";
import { api } from "../lib/bridge";
import { formatBytes, formatDuration } from "../lib/format";
import { navigate } from "../lib/router";
import { useJobs, type JobState } from "../stores/jobs";
import { useUi } from "../stores/ui";
import { useTransferStore } from "../stores/transfer";
import { toolById } from "./tools";

export interface SubtaskAction {
  id: string | number;
  title: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  percent?: number;
  speed?: number;
  eta?: number;
  error?: string;
}

export function extractSubtasks(job: JobState): SubtaskAction[] {
  const items = new Map<number | string, SubtaskAction>();

  // 1. Check job.partials
  if (Array.isArray(job.partials) && job.partials.length > 0) {
    for (const p of job.partials) {
      if (p && typeof p === "object") {
        const item = p as Record<string, unknown>;
        const idx = typeof item.index === "number" ? item.index : (typeof item.id === "string" ? item.id : null);
        if (idx != null) {
          const rawTitle = String(item.title || item.name || item.url || `Element #${Number(idx) + 1}`);
          const status = (item.status as SubtaskAction["status"]) || "pending";
          const existing = items.get(idx);
          items.set(idx, {
            id: idx,
            title: rawTitle,
            status,
            error: item.error ? String(item.error) : existing?.error,
            percent: typeof item.percent === "number" ? item.percent : existing?.percent,
          });
        }
      }
    }
  }

  // 2. Check job.result items if finished
  if (job.result && typeof job.result === "object" && "items" in job.result) {
    const resItems = (job.result as { items?: unknown[] }).items;
    if (Array.isArray(resItems)) {
      for (const item of resItems) {
        if (item && typeof item === "object") {
          const p = item as Record<string, unknown>;
          const idx = typeof p.index === "number" ? p.index : (typeof p.id === "string" ? p.id : null);
          if (idx != null) {
            const rawTitle = String(p.title || p.name || p.url || `Element #${Number(idx) + 1}`);
            const status = (p.status as SubtaskAction["status"]) || "done";
            items.set(idx, {
              id: idx,
              title: rawTitle,
              status,
              percent: status === "done" ? 100 : undefined,
              error: p.error ? String(p.error) : undefined,
            });
          }
        }
      }
    }
  }

  // 3. Live active item stats from extra
  if (job.status === "running" && typeof job.extra?.item === "number") {
    const curIdx = job.extra.item;
    const cur = items.get(curIdx);
    if (cur) {
      items.set(curIdx, {
        ...cur,
        status: "running",
        percent: typeof job.extra.itemPercent === "number" ? job.extra.itemPercent : cur.percent,
        speed: typeof job.extra.speed === "number" ? job.extra.speed : undefined,
        eta: typeof job.extra.eta === "number" ? job.extra.eta : undefined,
      });
    }
  }

  const list = Array.from(items.values());
  list.sort((a, b) => {
    if (typeof a.id === "number" && typeof b.id === "number") return a.id - b.id;
    return String(a.id).localeCompare(String(b.id));
  });

  return list;
}

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
  mica: {
    backdropFilter: "blur(24px)",
    backgroundColor: "rgba(32, 32, 32, 0.85)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px 10px 16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    overflowY: "auto",
    maxHeight: "460px",
    scrollbarWidth: "thin",
    scrollbarGutter: "stable",
  },
  jobCard: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  overallSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  headRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "8px",
  },
  toolInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    flexGrow: 1,
  },
  toolIconWrapper: {
    width: "24px",
    height: "24px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: "20px",
    color: tokens.colorNeutralForeground2,
    transitionProperty: "color",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveEasyEase,
  },
  jobTitleContainer: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flexGrow: 1,
    gap: "1px",
  },
  jobTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  jobSubtitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  headActions: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    flexShrink: 0,
  },
  chevronIcon: {
    transitionProperty: "transform",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveEasyEase,
    display: "inline-flex",
  },
  chevronIconOpen: {
    transform: "rotate(180deg)",
  },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    wordBreak: "break-word",
  },
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: tokens.fontSizeBase200,
  },
  expandCollapseWrapper: {
    display: "grid",
    gridTemplateRows: "0fr",
    transitionProperty: "grid-template-rows, opacity",
    transitionDuration: `${tokens.durationGentle}, ${tokens.durationNormal}`,
    transitionTimingFunction: `${tokens.curveDecelerateMid}, ${tokens.curveEasyEase}`,
    opacity: 0,
    overflow: "hidden",
  },
  expandCollapseWrapperOpen: {
    gridTemplateRows: "1fr",
    opacity: 1,
  },
  expandCollapseInner: {
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  subtaskList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "210px",
    overflowY: "auto",
    paddingRight: "2px",
    paddingTop: "6px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    scrollbarWidth: "thin",
    scrollbarGutter: "stable",
  },
  subtaskItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  subtaskRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  subtaskIconWrapper: {
    width: "16px",
    height: "16px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  subtaskTitle: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtaskStatusText: {
    flexShrink: 0,
    whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase200,
  },
  subtaskErrorBox: {
    color: tokens.colorPaletteRedForeground1,
    wordBreak: "break-word",
    fontSize: tokens.fontSizeBase100,
    backgroundColor: tokens.colorPaletteRedBackground1,
    padding: "4px 8px",
    borderRadius: tokens.borderRadiusSmall,
    marginTop: "2px",
    lineHeight: "1.3",
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
  },
  subtaskDetailRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  okIcon: { color: tokens.colorPaletteGreenForeground1 },
  badIcon: { color: tokens.colorPaletteRedForeground1 },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "32px 16px",
    textAlign: "center",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "10px 14px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

function SubtaskRow({ item }: { item: SubtaskAction }) {
  const styles = useStyles();
  const { t } = useTranslation();

  const isRunning = item.status === "running";
  const isDone = item.status === "done";
  const isError = item.status === "error";

  const displayTitle = t(item.title);

  return (
    <div className={styles.subtaskItem} title={item.error ?? displayTitle}>
      <div className={styles.subtaskRow}>
        <div className={styles.subtaskIconWrapper}>
          {isRunning ? (
            <Spinner size="extra-tiny" />
          ) : isDone ? (
            <CheckmarkCircle16Filled className={styles.okIcon} />
          ) : isError ? (
            <DismissCircle16Filled className={styles.badIcon} />
          ) : (
            <Clock16Regular className={styles.muted} />
          )}
        </div>
        <Text size={200} weight={isRunning ? "semibold" : "regular"} className={styles.subtaskTitle}>
          {displayTitle}
        </Text>
        <Caption1
          className={mergeClasses(
            styles.subtaskStatusText,
            isError ? styles.errorText : styles.muted,
          )}
        >
          {isDone
            ? ""
            : isRunning && item.percent != null
              ? `${Math.round(item.percent)}%`
              : isError
                ? t("common.jobStatus.error", { defaultValue: "Error" })
                : item.status === "pending"
                  ? t("jobs.pending", { defaultValue: "Pending" })
                  : item.status}
        </Caption1>
      </div>

      {isRunning && (
        <>
          <ProgressBar value={item.percent == null ? undefined : item.percent / 100} thickness="medium" />
          {(item.speed != null || item.eta != null) && (
            <div className={styles.subtaskDetailRow}>
              {item.speed != null && <Caption1 className={styles.muted}>{formatBytes(item.speed)}/s</Caption1>}
              {item.eta != null && <Caption1 className={styles.muted}>ETA {formatDuration(item.eta)}</Caption1>}
            </div>
          )}
        </>
      )}

      {isError && item.error && (
        <div className={styles.subtaskErrorBox}>{item.error}</div>
      )}
    </div>
  );
}

function getStatusIconColor(status: JobState["status"]): string {
  switch (status) {
    case "running":
      return tokens.colorPaletteBlueForeground2;
    case "done":
      return tokens.colorPaletteGreenForeground1;
    case "error":
      return tokens.colorPaletteRedForeground1;
    case "cancelled":
      return tokens.colorPaletteDarkOrangeForeground1;
    default:
      return tokens.colorNeutralForeground2;
  }
}

function JobCard({ job }: { job: JobState }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const setPopupOpen = useUi((s) => s.setJobsPopupOpen);
  const tool = toolById(job.kind.split(".")[0]);
  const Icon = tool?.icon;
  const message = jobMessage(t, job);
  const subtasks = useMemo(() => extractSubtasks(job), [job]);

  const running = job.status === "running";
  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
  const totalSubtasks = subtasks.length;

  // Collapsible state: defaults to expanded if running with subtasks, collapsed if finished.
  const [expanded, setExpanded] = useState<boolean>(running && totalSubtasks > 0);

  const extra = running ? job.extra : {};
  const speed = typeof extra.speed === "number" ? extra.speed : undefined;
  const eta = typeof extra.eta === "number" ? extra.eta : undefined;

  const resultFiles: string[] = useMemo(() => {
    if (job.status !== "done" || !job.result || typeof job.result !== "object") return [];
    const r = job.result as Record<string, unknown>;
    if (typeof r.outPath === "string" && r.outPath) return [r.outPath];
    if (typeof r.resultPath === "string" && r.resultPath) return [r.resultPath];
    if (Array.isArray(r.files) && r.files.length > 0 && typeof r.files[0] === "string") return r.files as string[];
    return [];
  }, [job.status, job.result]);

  const subtitle = job.title ? t(job.title) : undefined;
  const hasSubtitle = Boolean(subtitle && subtitle !== job.kind);

  return (
    <div className={styles.jobCard}>
      {/* 1. Overall section (Całość) */}
      <div className={styles.overallSection}>
        <div className={styles.headRow}>
          <div className={styles.toolInfo}>
            {Icon && (
              <div
                className={styles.toolIconWrapper}
                style={{ color: getStatusIconColor(job.status) }}
              >
                <Icon />
              </div>
            )}
            <div className={styles.jobTitleContainer}>
              <Text weight="semibold" className={styles.jobTitle}>
                {tool ? t(`tools.${tool.id}.name`) : job.kind}
              </Text>
              {hasSubtitle && (
                <Caption1 className={styles.jobSubtitle} title={subtitle}>
                  {subtitle}
                </Caption1>
              )}
            </div>
          </div>
          <div className={styles.headActions}>
            {running && (
              <Button
                size="small"
                appearance="subtle"
                icon={<Dismiss16Regular />}
                onClick={() => api.jobs.cancel(job.id)}
              >
                {t("common.cancel")}
              </Button>
            )}
            {totalSubtasks > 0 && (
              <Tooltip
                content={expanded ? t("jobs.collapseDetails") : t("jobs.expandDetails")}
                relationship="label"
              >
                <Button
                  size="small"
                  appearance="subtle"
                  icon={
                    <ChevronDown16Regular
                      className={mergeClasses(
                        styles.chevronIcon,
                        expanded && styles.chevronIconOpen,
                      )}
                    />
                  }
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? t("jobs.collapseDetails") : t("jobs.expandDetails")}
                />
              </Tooltip>
            )}
          </div>
        </div>

        {/* Overall progress bar */}
        {running && (
          <ProgressBar
            value={job.percent == null ? undefined : job.percent / 100}
            thickness="medium"
            shape="rounded"
          />
        )}

        {/* Overall stats: LiveElapsed ticker, speed, eta, and progress count / percent */}
        <div className={styles.statsRow}>
          <Caption1 className={styles.muted}>
            <LiveElapsed startedAt={job.startedAt} finishedAt={job.finishedAt} active={running} />
            {speed != null && ` · ${formatBytes(speed)}/s`}
            {eta != null && ` · ETA ${formatDuration(eta)}`}
          </Caption1>
          <Caption1 className={styles.muted}>
            {totalSubtasks > 0
              ? `${doneSubtasks}/${totalSubtasks} (${Math.round(job.percent ?? 0)}%)`
              : job.percent != null && running
                ? `${Math.round(job.percent)}%`
                : message || ""}
          </Caption1>
        </div>

        {/* Show error message if overall job failed and has no subtasks */}
        {job.status === "error" && message && !totalSubtasks && (
          <Caption1 className={styles.errorText}>{message}</Caption1>
        )}
      </div>

      {/* 2. Subtasks list - smooth expand/collapse transition */}
      {totalSubtasks > 0 && (
        <div
          className={mergeClasses(
            styles.expandCollapseWrapper,
            expanded && styles.expandCollapseWrapperOpen,
          )}
          aria-hidden={!expanded}
        >
          <div className={styles.expandCollapseInner}>
            <div className={styles.subtaskList}>
              {subtasks.map((item) => (
                <SubtaskRow key={String(item.id)} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
        {resultFiles.length > 0 && (
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowRight16Regular />}
            onClick={() => {
              useTransferStore.getState().openModal(resultFiles, tool?.id);
              setPopupOpen(false);
            }}
          >
            {t("transfer.sendTo")}
          </Button>
        )}
        {tool && (
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowRight16Regular />}
            iconPosition="after"
            onClick={() => {
              navigate(tool.id);
              setPopupOpen(false);
            }}
          >
            {t("jobs.openTool")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function JobsPopup({ collapsed }: { collapsed: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = useUi((s) => s.jobsPopupOpen);
  const setPopupOpen = useUi((s) => s.setJobsPopupOpen);
  const setDrawerOpen = useUi((s) => s.setJobsOpen);
  const mica = useUi((s) => s.mica);

  const popupRef = useRef<HTMLDivElement>(null);

  // Active or visible jobs
  const jobs = useJobs(useShallow((s) => s.order.map((id) => s.jobs[id]).filter((j) => !j.dismissed)));
  const runningJobs = jobs.filter((j) => j.status === "running");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const errorJobs = jobs.filter((j) => j.status === "error");
  const cancelledJobs = jobs.filter((j) => j.status === "cancelled");
  const clearFinished = useJobs((s) => s.clearFinished);
  const finishedCount = jobs.filter((j) => j.status !== "running").length;

  // Click outside and escape handling
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopupOpen(false);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        // Check if clicked the toggle button in navigation to prevent double toggle
        const target = e.target as HTMLElement;
        if (target.closest("[data-jobs-trigger]")) return;
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

  const leftPosition = collapsed ? "68px" : "284px";

  const handleOpenDrawer = () => {
    setPopupOpen(false);
    setDrawerOpen(true);
  };

  return (
    <div
      ref={popupRef}
      className={mergeClasses(styles.popup, mica && styles.mica)}
      style={{ left: leftPosition }}
      role="dialog"
      aria-label={t("jobs.popupTitle")}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          {runningJobs.length > 0 ? (
            <Spinner size="extra-tiny" />
          ) : errorJobs.length > 0 ? (
            <TaskListLtr20Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
          ) : (
            <TaskListLtr20Regular />
          )}
          <Text weight="semibold">{t("jobs.popupTitle")}</Text>

          {/* Status Badges with dedicated icons & colors */}
          {runningJobs.length > 0 && (
            <Tooltip content={t("jobs.activeCount", { count: runningJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="informative" icon={<Spinner size="extra-tiny" />}>
                {runningJobs.length}
              </Badge>
            </Tooltip>
          )}

          {doneJobs.length > 0 && (
            <Tooltip content={t("jobs.completedCount", { count: doneJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="success" icon={<CheckmarkCircle16Filled />}>
                {doneJobs.length}
              </Badge>
            </Tooltip>
          )}

          {errorJobs.length > 0 && (
            <Tooltip content={t("jobs.errorCount", { count: errorJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="danger" icon={<DismissCircle16Filled />}>
                {errorJobs.length}
              </Badge>
            </Tooltip>
          )}

          {cancelledJobs.length > 0 && (
            <Tooltip content={t("jobs.cancelledCount", { count: cancelledJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="warning" icon={<SubtractCircle16Filled />}>
                {cancelledJobs.length}
              </Badge>
            </Tooltip>
          )}
        </div>
        <div className={styles.headerActions}>
          <Tooltip content={t("jobs.showMoreTooltip")} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<Open16Regular />}
              onClick={handleOpenDrawer}
              aria-label={t("jobs.showMoreTooltip")}
            />
          </Tooltip>
          <Tooltip content={t("common.close")} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<Dismiss16Regular />}
              onClick={() => setPopupOpen(false)}
              aria-label={t("common.close")}
            />
          </Tooltip>
        </div>
      </div>

      {/* Body: Overall + Specific Actions */}
      <div className={styles.body}>
        {jobs.length === 0 ? (
          <div className={styles.empty}>
            <TaskListLtr24Regular className={styles.muted} style={{ fontSize: "32px" }} />
            <Text weight="semibold">{t("jobs.noActiveJobs")}</Text>
            <Caption1 className={styles.muted}>{t("jobs.noActiveJobsBody")}</Caption1>
          </div>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>

      {/* Footer: only shown when there are finished jobs to clear */}
      {finishedCount > 0 && (
        <div className={styles.footer}>
          <Tooltip content={t("jobs.clearHint")} relationship="description">
            <Button size="small" appearance="subtle" icon={<Delete16Regular />} onClick={clearFinished}>
              {t("jobs.clearFinished")}
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

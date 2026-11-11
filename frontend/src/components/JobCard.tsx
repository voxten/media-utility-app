// Job card shared by the jobs popup and the home page's recent jobs.

import { memo, useMemo, useState, type ReactElement } from "react";
import {
  Button,
  Caption1,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  mergeClasses,
  ProgressBar,
  Spinner,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowClockwise16Regular,
  ArrowRight16Regular,
  CheckmarkCircle16Filled,
  ChevronDown16Regular,
  Clock16Regular,
  Copy16Regular,
  Dismiss16Regular,
  DismissCircle16Filled,
  FolderOpen16Regular,
  MoreHorizontal16Regular,
  Open16Regular,
  SubtractCircle16Filled,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolForJob } from "../app/tools";
import { api } from "../lib/bridge";
import { formatBytes, formatDateTime, formatDuration, formatTime } from "../lib/format";
import { jobMessage, translateMessage } from "../lib/jobMessage";
import { jobSummary } from "../lib/jobSummary";
import { navigate } from "../lib/router";
import { historyJob, retryJob, useJobs, type JobState } from "../stores/jobs";
import type { HistoryEntry } from "../lib/types";
import { useTransferStore } from "../stores/transfer";
import { useLiveElapsed } from "./LiveElapsed";
import { useNotify } from "./notify";

export interface SubtaskAction {
  id: string | number;
  title: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  percent?: number;
  speed?: number;
  eta?: number;
  error?: string;
  size?: number;
  duration?: number;
}

export function extractSubtasks(job: JobState): SubtaskAction[] {
  const items = new Map<number | string, SubtaskAction>();

  if (Array.isArray(job.partials) && job.partials.length > 0) {
    for (const p of job.partials) {
      if (p && typeof p === "object") {
        const item = p as Record<string, unknown>;
        const idx = typeof item.index === "number" ? item.index : (typeof item.id === "string" ? item.id : null);
        if (idx != null) {
          const rawTitle = String(item.title || item.name || item.url || `#${Number(idx) + 1}`);
          const status = (item.status as SubtaskAction["status"]) || "pending";
          const existing = items.get(idx);
          items.set(idx, {
            id: idx,
            title: rawTitle,
            status,
            error: item.error ? String(item.error) : existing?.error,
            percent: typeof item.percent === "number" ? item.percent : existing?.percent,
            size: typeof item.size === "number" ? item.size : existing?.size,
            duration: typeof item.duration === "number" ? item.duration : existing?.duration,
          });
        }
      }
    }
  }

  if (job.result && typeof job.result === "object" && "items" in job.result) {
    const resItems = (job.result as { items?: unknown[] }).items;
    if (Array.isArray(resItems)) {
      for (const item of resItems) {
        if (item && typeof item === "object") {
          const p = item as Record<string, unknown>;
          const idx = typeof p.index === "number" ? p.index : (typeof p.id === "string" ? p.id : null);
          if (idx != null) {
            const rawTitle = String(p.title || p.name || p.url || `#${Number(idx) + 1}`);
            const status = (p.status as SubtaskAction["status"]) || "done";
            items.set(idx, {
              id: idx,
              title: rawTitle,
              status,
              percent: status === "done" ? 100 : undefined,
              error: p.error ? String(p.error) : undefined,
              size: typeof p.size === "number" ? p.size : undefined,
              duration: typeof p.duration === "number" ? p.duration : undefined,
            });
          }
        }
      }
    }
  }

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
        size: typeof job.extra.total === "number" && job.extra.total > 0 ? job.extra.total : (typeof job.extra.downloaded === "number" ? job.extra.downloaded : cur.size),
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
  jobCard: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralCardBackground,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  headRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },
  toolIcon: {
    width: "24px",
    height: "24px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: "20px",
  },
  thumbWrap: {
    position: "relative",
    flexShrink: 0,
    width: "64px",
    height: "36px",
  },
  thumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: tokens.borderRadiusMedium,
    display: "block",
  },
  thumbStatus: {
    position: "absolute",
    right: "-4px",
    bottom: "-4px",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralCardBackground,
  },
  titles: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flexGrow: 1,
  },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headActions: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  chevronIcon: {
    display: "inline-flex",
    transitionProperty: "transform",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveEasyEase,
  },
  chevronIconOpen: {
    transform: "rotate(180deg)",
  },
  infoRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "8px",
    minWidth: 0,
  },
  infoText: {
    flexGrow: 1,
    minWidth: 0,
  },
  infoSide: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    wordBreak: "break-word",
    display: "-webkit-box",
    WebkitLineClamp: "3",
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
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
  },
  subtaskList: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "210px",
    overflowY: "auto",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    scrollbarWidth: "thin",
    scrollbarGutter: "stable",
  },
  subtaskItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "6px 2px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    ":last-child": { borderBottom: "none" },
  },
  subtaskRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  subtaskIcon: {
    width: "16px",
    height: "16px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  subtaskTitle: {
    flexGrow: 1,
    minWidth: 0,
  },
  subtaskError: {
    color: tokens.colorPaletteRedForeground1,
    wordBreak: "break-word",
    paddingLeft: "24px",
  },
  okIcon: { color: tokens.colorPaletteGreenForeground1 },
  badIcon: { color: tokens.colorPaletteRedForeground1 },
  cancelledIcon: { color: tokens.colorPaletteDarkOrangeForeground1 },
});

const SEPARATOR = " · ";

/** Progress messages end with "…" or "."; inside a line of facts they read better without. */
const stageText = (message: string) => message.replace(/[….]+$/u, "").trim();

function SubtaskRow({ item }: { item: SubtaskAction }) {
  const styles = useStyles();
  const { t } = useTranslation();

  const isRunning = item.status === "running";
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const displayTitle = translateMessage(t, item.title);

  const side = isDone
    ? formatSize(item.size)
    : isRunning
      ? [
          item.speed != null ? `${formatBytes(item.speed)}/s` : undefined,
          item.eta != null ? t("common.eta", { time: formatDuration(item.eta) }) : undefined,
          item.percent != null ? `${Math.round(item.percent)}%` : undefined,
        ]
          .filter(Boolean)
          .join(SEPARATOR)
      : isError
        ? t("common.jobStatus.error")
        : item.status === "pending"
          ? t("jobs.pending")
          : t(`common.jobStatus.${item.status}`);

  return (
    <div className={styles.subtaskItem} title={displayTitle}>
      <div className={styles.subtaskRow}>
        <div className={styles.subtaskIcon}>
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
        <Text size={200} weight={isRunning ? "semibold" : "regular"} className={mergeClasses(styles.subtaskTitle, styles.ellipsis)}>
          {displayTitle}
        </Text>
        <Caption1 className={mergeClasses(styles.infoSide, isError ? styles.badIcon : styles.muted)}>{side}</Caption1>
      </div>
      {isRunning && <ProgressBar value={item.percent == null ? undefined : item.percent / 100} thickness="medium" />}
      {isError && item.error && <Caption1 className={styles.subtaskError}>{item.error}</Caption1>}
    </div>
  );
}

const formatSize = (size: number | undefined) => (size != null && size > 0 ? formatBytes(size) : "");

function statusColor(status: JobState["status"]): string {
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

function StatusBadge({ status }: { status: JobState["status"] }) {
  const styles = useStyles();
  if (status === "done") return <CheckmarkCircle16Filled className={styles.okIcon} />;
  if (status === "error") return <DismissCircle16Filled className={styles.badIcon} />;
  if (status === "cancelled") return <SubtractCircle16Filled className={styles.cancelledIcon} />;
  return null;
}

/** Where "Show in folder" points: a saved file or the output folder, never an unsaved preview (resultPath). */
export function revealTarget(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const files = Array.isArray(r.files) ? r.files : [];
  const candidates = [r.outPath, r.path, files[0], r.outputDir, r.outDir, r.outdir];
  return candidates.find((c): c is string => typeof c === "string" && c !== "") ?? null;
}

/** The one file a job wrote, for "Open file"; null for several files, a folder or an unsaved preview. */
export function openTarget(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const files = Array.isArray(r.files) ? r.files.filter((f): f is string => typeof f === "string" && f !== "") : [];
  if (files.length > 1) return null;
  return [r.outPath, r.path, files[0]].find((c): c is string => typeof c === "string" && c !== "") ?? null;
}

/** Files offered in "Send to": the job's output, including an unsaved preview (resultPath). */
export function transferTargets(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  for (const single of [r.outPath, r.resultPath, r.path]) {
    if (typeof single === "string" && single) return [single];
  }
  if (Array.isArray(r.files) && r.files.length > 0 && typeof r.files[0] === "string") return r.files as string[];
  return [];
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

interface JobCardProps {
  job: JobState;
  /** Runs after "Open tool" / "Send to". */
  onNavigate?: () => void;
  /** Set for a job from an earlier session: shows when it finished and whether its output still exists. */
  saved?: { available: boolean };
  /** When the job finished: the full date (default for saved jobs) or only the time, under a day heading. */
  when?: "date" | "time";
}

/**
 * One job: what it works on, its progress or result in one line, and its actions as icons and a menu.
 * Memoised: a progress event re-renders only the card of the job it belongs to.
 */
export const JobCard = memo(function JobCard({ job, onNavigate, saved, when = saved ? "date" : undefined }: JobCardProps) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const notify = useNotify();
  const tool = toolForJob(job.kind);
  const Icon = tool?.icon;
  const subtasks = useMemo(() => extractSubtasks(job), [job]);

  const running = job.status === "running";
  const done = job.status === "done";
  const failed = job.status === "error";
  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
  const totalSubtasks = subtasks.length;

  // Running batches start expanded so per-item progress is visible.
  const [expanded, setExpanded] = useState<boolean>(running && totalSubtasks > 0);
  const elapsed = useLiveElapsed(job.startedAt, job.finishedAt, running);

  const outputMissing = saved ? !saved.available : false;
  const resultFiles = useMemo(
    () => (done && !outputMissing ? transferTargets(job.result) : []),
    [done, outputMissing, job.result],
  );
  const revealPath = done ? revealTarget(job.result) : null;
  const openPath = done && !outputMissing ? openTarget(job.result) : null;
  const canRetry = failed && job.retryable && !saved;
  const message = jobMessage(t, job);
  const errorText = failed ? message : "";

  const subtitle = translateMessage(t, job.title);
  const uploader = job.meta?.uploader;
  const thumb = job.meta?.thumb;

  const info: string[] = [];
  let side = "";
  if (when && !running && job.finishedAt != null) {
    info.push(when === "time" ? formatTime(job.finishedAt, i18n.language) : formatDateTime(job.finishedAt, i18n.language));
  }
  if (running) {
    const downloaded = num(job.extra.downloaded);
    const total = num(job.extra.total);
    const speed = num(job.extra.speed);
    const eta = num(job.extra.eta);
    if (message) info.push(stageText(message));
    if (!totalSubtasks && downloaded) {
      info.push(
        total && total >= downloaded
          ? t("jobs.progressBytes", { done: formatBytes(downloaded), total: formatBytes(total) })
          : formatBytes(downloaded),
      );
    }
    if (speed) info.push(`${formatBytes(speed)}/s`);
    info.push(eta != null ? t("common.eta", { time: formatDuration(eta) }) : elapsed);
    const percent = job.percent != null ? `${Math.round(job.percent)}%` : "";
    side = totalSubtasks ? [`${doneSubtasks}/${totalSubtasks}`, percent].filter(Boolean).join(SEPARATOR) : percent;
  } else {
    if (done) info.push(...jobSummary(t, job.kind, job.result));
    if (job.status === "cancelled") info.push(t("common.jobStatus.cancelled"));
    if (outputMissing) info.push(t("jobs.outputMissing"));
    info.push(elapsed);
  }
  const infoText = info.join(SEPARATOR);

  const copy = (text: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify.success(t("jobs.copied")))
      .catch(() => undefined);

  const copyPath = outputMissing ? null : (openPath ?? revealPath);
  const menuItems = [
    resultFiles.length > 0 && (
      <MenuItem
        key="send"
        icon={<ArrowRight16Regular />}
        onClick={() => {
          useTransferStore.getState().openModal(resultFiles, tool?.id);
          onNavigate?.();
        }}
      >
        {t("transfer.sendTo")}
      </MenuItem>
    ),
    copyPath && (
      <MenuItem key="path" icon={<Copy16Regular />} onClick={() => copy(copyPath)}>
        {t("jobs.copyPath")}
      </MenuItem>
    ),
    errorText && (
      <MenuItem key="error" icon={<Copy16Regular />} onClick={() => copy(errorText)}>
        {t("jobs.copyError")}
      </MenuItem>
    ),
    tool && (
      <MenuItem
        key="tool"
        icon={Icon && <Icon />}
        onClick={() => {
          navigate(tool.id);
          onNavigate?.();
        }}
      >
        {t("jobs.openTool")}
      </MenuItem>
    ),
  ].filter(Boolean);

  const iconButton = (label: string, icon: ReactElement, onClick: () => void, disabled = false) => (
    <Tooltip content={label} relationship="label">
      <Button size="small" appearance="subtle" icon={icon} onClick={onClick} disabledFocusable={disabled} />
    </Tooltip>
  );

  return (
    <div className={styles.jobCard}>
      <div className={styles.headRow}>
        {thumb ? (
          <div className={styles.thumbWrap}>
            <img className={styles.thumb} src={thumb} alt="" />
            {!running && (
              <span className={styles.thumbStatus}>
                <StatusBadge status={job.status} />
              </span>
            )}
          </div>
        ) : (
          Icon && (
            <div className={styles.toolIcon} style={{ color: statusColor(job.status) }}>
              <Icon />
            </div>
          )
        )}
        <div className={styles.titles}>
          <Text weight="semibold" className={styles.ellipsis}>
            {tool ? t(`tools.${tool.id}.name`) : job.kind}
          </Text>
          {subtitle && subtitle !== job.kind && (
            <Caption1 className={mergeClasses(styles.ellipsis, styles.muted)} title={subtitle}>
              {uploader ? `${subtitle}${SEPARATOR}${uploader}` : subtitle}
            </Caption1>
          )}
        </div>
        <div className={styles.headActions}>
          {running && iconButton(t("common.cancel"), <Dismiss16Regular />, () => api.jobs.cancel(job.id))}
          {canRetry &&
            iconButton(t("jobs.retry"), <ArrowClockwise16Regular />, () => retryJob(job.id).catch(() => undefined))}
          {openPath &&
            iconButton(t("jobs.openFile"), <Open16Regular />, () => api.system.openPath(openPath).catch(() => undefined))}
          {revealPath &&
            iconButton(
              outputMissing ? t("jobs.outputMissing") : t("common.showInFolder"),
              <FolderOpen16Regular />,
              () => api.system.reveal(revealPath).catch(() => undefined),
              outputMissing,
            )}
          {!running && menuItems.length > 0 && (
            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                <Tooltip content={t("common.more")} relationship="label">
                  <Button size="small" appearance="subtle" icon={<MoreHorizontal16Regular />} />
                </Tooltip>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>{menuItems}</MenuList>
              </MenuPopover>
            </Menu>
          )}
          {totalSubtasks > 0 &&
            iconButton(
              expanded ? t("jobs.collapseDetails") : t("jobs.expandDetails"),
              <ChevronDown16Regular className={mergeClasses(styles.chevronIcon, expanded && styles.chevronIconOpen)} />,
              () => setExpanded((v) => !v),
            )}
        </div>
      </div>

      {running && (
        <ProgressBar value={job.percent == null ? undefined : job.percent / 100} thickness="medium" shape="rounded" />
      )}

      <div className={styles.infoRow}>
        <Caption1 className={mergeClasses(styles.infoText, styles.ellipsis, styles.muted)} title={infoText}>
          {infoText}
        </Caption1>
        {side && <Caption1 className={mergeClasses(styles.infoSide, styles.muted)}>{side}</Caption1>}
      </div>

      {errorText && !totalSubtasks && (
        <Caption1 className={styles.errorText} title={errorText}>
          {errorText}
        </Caption1>
      )}

      {totalSubtasks > 0 && (
        <div
          className={mergeClasses(styles.expandCollapseWrapper, expanded && styles.expandCollapseWrapperOpen)}
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
    </div>
  );
});

interface HistoryJobCardProps extends Pick<JobCardProps, "onNavigate" | "when"> {
  entry: HistoryEntry;
  /** Show this session's live job instead while the store still has it. */
  preferLive?: boolean;
}

/** A job from the saved history. Subscribes to its own job only, so other jobs' progress leaves it alone. */
export const HistoryJobCard = memo(function HistoryJobCard({ entry, preferLive, when, onNavigate }: HistoryJobCardProps) {
  const live = useJobs((state) => (preferLive ? state.jobs[entry.id] : undefined));
  const saved = useMemo(() => historyJob(entry), [entry]);
  return live ? (
    <JobCard job={live} when={when} onNavigate={onNavigate} />
  ) : (
    <JobCard job={saved} saved={entry} when={when} onNavigate={onNavigate} />
  );
});

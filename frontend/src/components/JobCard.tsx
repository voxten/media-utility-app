// Job card shared by the jobs popup and the home page's recent jobs.

import { memo, useMemo, useState, type ReactElement } from "react";
import { Button, Caption1, mergeClasses, ProgressBar, Text, tokens, Tooltip } from "@fluentui/react-components";
import {
  ArrowClockwise16Regular,
  CheckmarkCircle16Filled,
  ChevronDown16Regular,
  Dismiss16Regular,
  DismissCircle16Filled,
  FolderOpen16Regular,
  Open16Regular,
  SubtractCircle16Filled,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolForJob } from "../app/tools";
import { api } from "../lib/bridge";
import { jobMessage, translateMessage } from "../lib/jobMessage";
import type { HistoryEntry } from "../lib/types";
import { historyJob, retryJob, useJobs, type JobState } from "../stores/jobs";
import { JobMenu } from "./jobCard/JobMenu";
import { useJobCardStyles } from "./jobCard/styles";
import { SubtaskRow } from "./jobCard/SubtaskRow";
import { jobInfoLine, SEPARATOR } from "./jobCard/summary";
import { extractSubtasks, openTarget, revealTarget, transferTargets } from "./jobCard/targets";
import { useLiveElapsed } from "./LiveElapsed";

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
  const styles = useJobCardStyles();
  if (status === "done") return <CheckmarkCircle16Filled className={styles.okIcon} />;
  if (status === "error") return <DismissCircle16Filled className={styles.badIcon} />;
  if (status === "cancelled") return <SubtractCircle16Filled className={styles.cancelledIcon} />;
  return null;
}

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
  const styles = useJobCardStyles();
  const { t, i18n } = useTranslation();
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

  const { text: infoText, side } = jobInfoLine(t, {
    job,
    message,
    elapsed,
    language: i18n.language,
    when,
    outputMissing,
    doneSubtasks,
    totalSubtasks,
  });

  const copyPath = outputMissing ? null : (openPath ?? revealPath);

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
          {!running && (
            <JobMenu
              tool={tool}
              resultFiles={resultFiles}
              copyPath={copyPath}
              errorText={errorText}
              onNavigate={onNavigate}
            />
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

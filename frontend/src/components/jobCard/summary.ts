import type { TFunction } from "i18next";
import { formatBytes, formatDateTime, formatDuration, formatTime } from "../../lib/format";
import { jobSummary } from "../../lib/jobSummary";
import type { JobState } from "../../stores/jobs";

export const SEPARATOR = " · ";

/** Progress messages end with "…" or "."; inside a line of facts they read better without. */
const stageText = (message: string) => message.replace(/[….]+$/u, "").trim();

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

interface InfoLineInput {
  job: JobState;
  message: string;
  elapsed: string;
  language: string;
  when?: "date" | "time";
  outputMissing: boolean;
  doneSubtasks: number;
  totalSubtasks: number;
}

/**
 * The card's line of facts: the current step, bytes, speed and time left while running, or what the job
 * produced once finished. ``side`` is the short part shown on the right (percent, items done).
 */
export function jobInfoLine(t: TFunction, input: InfoLineInput): { text: string; side: string } {
  const { job, message, elapsed, language, when, outputMissing, doneSubtasks, totalSubtasks } = input;
  const running = job.status === "running";
  const info: string[] = [];
  let side = "";
  if (when && !running && job.finishedAt != null) {
    info.push(when === "time" ? formatTime(job.finishedAt, language) : formatDateTime(job.finishedAt, language));
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
    if (job.status === "done") info.push(...jobSummary(t, job.kind, job.result));
    if (job.status === "cancelled") info.push(t("common.jobStatus.cancelled"));
    if (outputMissing) info.push(t("jobs.outputMissing"));
    info.push(elapsed);
  }
  return { text: info.join(SEPARATOR), side };
}

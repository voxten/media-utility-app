// Human-readable text for job progress messages and errors (backend sends i18n keys + params).

import type { TFunction } from "i18next";
import type { JobInfo } from "./types";

/** Translates a backend i18n key + params (falls back to the raw text for library errors). */
export function translateMessage(t: TFunction, message: string | null | undefined, params?: Record<string, unknown>) {
  if (!message) return "";
  return t(message, { ...params, defaultValue: message });
}

const ANSI_REGEX = /(?:\x1b|\u001b)?\[[0-9;]*[a-zA-Z]/g;

export function jobMessage(
  t: TFunction,
  job: Pick<JobInfo, "status" | "message" | "params" | "error"> & { percent?: number | null }
) {
  if (job.status === "error") {
    const err = job.error ?? t("common.jobStatus.error");
    return err.replace(ANSI_REGEX, "").replace(/^ERROR:\s*/i, "").trim();
  }
  const percent = job.percent != null ? Math.round(job.percent) : undefined;
  return translateMessage(t, job.message, { percent, ...job.params });
}

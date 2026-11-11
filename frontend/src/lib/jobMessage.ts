// Human-readable text for job progress messages and errors (backend sends i18n keys + params).

import type { TFunction } from "i18next";
import type { JobInfo } from "./types";

/**
 * Translates a backend i18n key + params; any other text (library errors, URLs, file names) is returned as is.
 * nsSeparator is off so "https://…" is not split into an "https" namespace.
 */
export function translateMessage(t: TFunction, message: string | null | undefined, params?: Record<string, unknown>) {
  if (!message) return "";
  return t(message, { ...params, defaultValue: message, nsSeparator: false });
}

// A colour code may arrive without its ESC byte ("[0;31m"); without ESC only digit codes ending in "m"
// are colours, so "[twitter]" and "[youtube]" in yt-dlp errors stay intact.
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\[[0-9;]+m/g;

export function jobMessage(
  t: TFunction,
  job: Pick<JobInfo, "status" | "message" | "params" | "error"> & { percent?: number | null }
) {
  if (job.status === "error") {
    const err = job.error ?? t("common.jobStatus.error");
    return translateMessage(t, err.replace(ANSI_REGEX, "").replace(/^ERROR:\s*/i, "").trim());
  }
  const percent = job.percent != null ? Math.round(job.percent) : undefined;
  return translateMessage(t, job.message, { percent, ...job.params });
}

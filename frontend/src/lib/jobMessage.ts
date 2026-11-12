// Human-readable text for job progress messages and errors (backend sends i18n keys + params).

import type { TFunction } from "i18next";
import type { JobInfo } from "./types";

// A backend AppError with values arrives as `errors.fileMissing|{"file":"a.png"}` (backend/core/errors.py).
const KEY_WITH_PARAMS = /^([A-Za-z]\w*(?:\.\w+)+)\|(\{.*\})$/s;

function splitKey(message: string): [string, Record<string, unknown>] {
  const match = KEY_WITH_PARAMS.exec(message);
  if (!match) return [message, {}];
  try {
    return [match[1], JSON.parse(match[2]) as Record<string, unknown>];
  } catch {
    return [message, {}];
  }
}

/**
 * Translates a backend i18n key + params; any other text (library errors, URLs, file names) is returned as is.
 * nsSeparator is off so "https://…" is not split into an "https" namespace.
 */
export function translateMessage(t: TFunction, message: string | null | undefined, params?: Record<string, unknown>) {
  if (!message) return "";
  const [key, sent] = splitKey(message);
  return t(key, { ...sent, ...params, defaultValue: key === message ? message : key, nsSeparator: false });
}

// A colour code may arrive without its ESC byte ("[0;31m"); without ESC only digit codes ending in "m"
// are colours, so "[twitter]" and "[youtube]" in yt-dlp errors stay intact.
// eslint-disable-next-line no-control-regex -- the ESC byte is exactly what this strips
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

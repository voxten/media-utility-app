import { Badge, Spinner } from "@fluentui/react-components";
import { CheckmarkCircle12Filled, DismissCircle12Filled, ErrorCircle12Filled } from "@fluentui/react-icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { JobInfo, JobStatus } from "../lib/types";

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

const COLORS: Record<JobStatus, "informative" | "success" | "danger" | "subtle"> = {
  running: "informative",
  done: "success",
  error: "danger",
  cancelled: "subtle",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const icon =
    status === "running" ? (
      <Spinner size="extra-tiny" />
    ) : status === "done" ? (
      <CheckmarkCircle12Filled />
    ) : status === "error" ? (
      <ErrorCircle12Filled />
    ) : (
      <DismissCircle12Filled />
    );
  return (
    <Badge appearance="tint" color={COLORS[status]} icon={icon}>
      {t(`common.jobStatus.${status}`)}
    </Badge>
  );
}

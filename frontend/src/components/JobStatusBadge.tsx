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

export function jobMessage(t: TFunction, job: Pick<JobInfo, "status" | "message" | "params" | "error">) {
  if (job.status === "error") return job.error ?? t("common.jobStatus.error");
  return translateMessage(t, job.message, job.params);
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

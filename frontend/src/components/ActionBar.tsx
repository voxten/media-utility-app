// Sticky bottom bar of a tool page: live job status + progress on the left, actions on the right.

import type { ReactNode } from "react";
import { Button, Caption1, makeStyles, mergeClasses, ProgressBar, Text, tokens } from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { JobState } from "../stores/jobs";
import { jobMessage } from "../lib/jobMessage";

const useStyles = makeStyles({
  bar: {
    position: "sticky",
    bottom: "16px",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "14px 20px",
    marginTop: "auto",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
    flexWrap: "wrap",
    boxSizing: "border-box",
  },
  status: { flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" },
  line: { display: "flex", justifyContent: "space-between", gap: "12px", minWidth: 0 },
  message: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  percent: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
  idle: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1 },
  actions: { display: "flex", gap: "8px", flexShrink: 0, flexWrap: "wrap" },
});

interface ActionBarProps {
  job?: JobState;
  /** Shown when no job is running (e.g. "12 files ready"). */
  idleText?: ReactNode;
  /** Extra stats on the right of the status line (e.g. speed, ETA). */
  detail?: ReactNode;
  onCancel?: () => void;
  children?: ReactNode;
}

export function ActionBar({ job, idleText, detail, onCancel, children }: ActionBarProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const running = job?.status === "running";

  return (
    <div className={styles.bar}>
      <div className={styles.status} aria-live="polite">
        {job ? (
          <>
            <div className={styles.line}>
              <Text className={mergeClasses(styles.message, job.status === "error" && styles.error)}>{jobMessage(t, job) || t("common.status.working")}</Text>
              <Caption1 className={styles.percent}>
                {detail}
                {running && job.percent != null && `  ${Math.round(job.percent)}%`}
              </Caption1>
            </div>
            {running && <ProgressBar value={job.percent == null ? undefined : job.percent / 100} thickness="large" shape="rounded" />}
          </>
        ) : (
          <Text className={styles.idle}>{idleText}</Text>
        )}
      </div>
      <div className={styles.actions}>
        {running && onCancel && (
          <Button icon={<Dismiss16Regular />} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

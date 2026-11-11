// Bottom bar of a tool page: live job status + progress on the left, actions on the right.
// Inside a Page it docks to the page's bottom edge, below the scroll area.

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Caption1, makeStyles, mergeClasses, ProgressBar, Text, tokens } from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { JobState } from "../stores/jobs";
import { jobMessage } from "../lib/jobMessage";
import { useToolShortcuts } from "../lib/useToolShortcuts";
import { PAGE_GUTTER, PAGE_MAX_WIDTH, usePageFooter } from "./pageFooter";

const useStyles = makeStyles({
  bar: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minHeight: "64px",
    flexWrap: "wrap",
    boxSizing: "border-box",
  },
  docked: {
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
    // The page's scroll area keeps a 10px scrollbar gutter on the right; match it so both columns line up.
    padding: `12px calc(${PAGE_GUTTER} + 10px) 12px ${PAGE_GUTTER}`,
  },
  standalone: {
    padding: "12px 20px",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralCardBackground,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
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
  const footer = usePageFooter();
  useToolShortcuts({ cancel: running && onCancel });

  const bar = (
    <div className={mergeClasses(styles.bar, footer ? styles.docked : styles.standalone)}>
      <div className={styles.status} aria-live="polite">
        {job ? (
          <>
            <div className={styles.line}>
              <Text className={mergeClasses(styles.message, job.status === "error" && styles.error)}>{jobMessage(t, job) || (running ? t("common.status.working") : t(`common.jobStatus.${job.status}`))}</Text>
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
  return footer ? createPortal(bar, footer) : bar;
}

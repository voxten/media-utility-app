// Floating jobs popup anchored to the navigation rail; the only place that lists every job.

import { useEffect,  useRef } from "react";
import {
  Badge,
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowSyncCircle16Filled,
  CheckmarkCircle16Filled,
  Delete16Regular,
  Dismiss16Regular,
  DismissCircle16Filled,
  SubtractCircle16Filled,
  TaskListLtr20Regular,
  TaskListLtr24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { JobCard } from "../components/JobCard";
import { useJobs } from "../stores/jobs";
import { useUi } from "../stores/ui";

const useStyles = makeStyles({
  popup: {
    position: "fixed",
    bottom: "16px",
    zIndex: 990,
    width: "420px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "min(580px, calc(100vh - 32px))",
    display: "flex",
    flexDirection: "column",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow28,
    overflow: "hidden",
    animationName: {
      from: { opacity: 0, transform: "translateY(10px) scale(0.98)" },
      to: { opacity: 1, transform: "none" },
    },
    animationDuration: tokens.durationNormal,
    animationTimingFunction: tokens.curveDecelerateMid,
    transitionProperty: "left",
    transitionDuration: tokens.durationGentle,
    transitionTimingFunction: tokens.curveEasyEase,
  },
  mica: {
    backdropFilter: "blur(24px)",
    backgroundColor: "rgba(32, 32, 32, 0.85)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px 10px 16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    overflowY: "auto",
    maxHeight: "460px",
    scrollbarWidth: "thin",
    scrollbarGutter: "stable",
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "32px 16px",
    textAlign: "center",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "10px 14px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerIconRunning: { color: tokens.colorPaletteBlueForeground2 },
  headerIconError: { color: tokens.colorPaletteRedForeground1 },
  emptyIcon: { fontSize: "32px" },
});

export function JobsPopup({ collapsed }: { collapsed: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = useUi((s) => s.jobsPopupOpen);
  const setPopupOpen = useUi((s) => s.setJobsPopupOpen);
  const mica = useUi((s) => s.mica);

  const popupRef = useRef<HTMLDivElement>(null);

  const jobs = useJobs(useShallow((s) => s.order.map((id) => s.jobs[id]).filter((j) => !j.dismissed)));
  const runningJobs = jobs.filter((j) => j.status === "running");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const errorJobs = jobs.filter((j) => j.status === "error");
  const cancelledJobs = jobs.filter((j) => j.status === "cancelled");
  const clearFinished = useJobs((s) => s.clearFinished);
  const finishedCount = jobs.filter((j) => j.status !== "running").length;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopupOpen(false);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        // The rail button toggles the popup itself; closing here too would reopen it.
        const target = e.target as HTMLElement;
        if (target.closest("[data-jobs-trigger]")) return;
        setPopupOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, setPopupOpen]);

  if (!open) return null;

  const leftPosition = collapsed ? "68px" : "284px";

  return (
    <div
      ref={popupRef}
      className={mergeClasses(styles.popup, mica && styles.mica)}
      style={{ left: leftPosition }}
      role="dialog"
      aria-label={t("jobs.popupTitle")}
    >
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          {runningJobs.length > 0 ? (
            <TaskListLtr20Regular className={styles.headerIconRunning} />
          ) : errorJobs.length > 0 ? (
            <TaskListLtr20Regular className={styles.headerIconError} />
          ) : (
            <TaskListLtr20Regular />
          )}
          <Text weight="semibold">{t("jobs.popupTitle")}</Text>

          {runningJobs.length > 0 && (
            <Tooltip content={t("jobs.activeCount", { count: runningJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="informative" icon={<ArrowSyncCircle16Filled />}>
                {runningJobs.length}
              </Badge>
            </Tooltip>
          )}

          {doneJobs.length > 0 && (
            <Tooltip content={t("jobs.completedCount", { count: doneJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="success" icon={<CheckmarkCircle16Filled />}>
                {doneJobs.length}
              </Badge>
            </Tooltip>
          )}

          {errorJobs.length > 0 && (
            <Tooltip content={t("jobs.errorCount", { count: errorJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="danger" icon={<DismissCircle16Filled />}>
                {errorJobs.length}
              </Badge>
            </Tooltip>
          )}

          {cancelledJobs.length > 0 && (
            <Tooltip content={t("jobs.cancelledCount", { count: cancelledJobs.length })} relationship="label">
              <Badge size="small" appearance="tint" color="warning" icon={<SubtractCircle16Filled />}>
                {cancelledJobs.length}
              </Badge>
            </Tooltip>
          )}
        </div>
        <div className={styles.headerActions}>
          <Tooltip content={t("common.close")} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<Dismiss16Regular />}
              onClick={() => setPopupOpen(false)}
              aria-label={t("common.close")}
            />
          </Tooltip>
        </div>
      </div>

      <div className={styles.body}>
        {jobs.length === 0 ? (
          <div className={styles.empty}>
            <TaskListLtr24Regular className={mergeClasses(styles.muted, styles.emptyIcon)} />
            <Text weight="semibold">{t("jobs.noActiveJobs")}</Text>
            <Caption1 className={styles.muted}>{t("jobs.noActiveJobsBody")}</Caption1>
          </div>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} onNavigate={() => setPopupOpen(false)} />)
        )}
      </div>

      {finishedCount > 0 && (
        <div className={styles.footer}>
          <Button size="small" appearance="subtle" icon={<Delete16Regular />} onClick={clearFinished}>
            {t("jobs.clearFinished")}
          </Button>
        </div>
      )}
    </div>
  );
}

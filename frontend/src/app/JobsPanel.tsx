// Right-hand drawer listing every background job across tools.

import {
  Button,
  Caption1,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  makeStyles,
  OverlayDrawer,
  ProgressBar,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import { ArrowRight16Regular, Delete16Regular, Dismiss16Regular, Dismiss24Regular, TaskListLtr24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { EmptyState } from "../components/EmptyState";
import { JobStatusBadge, jobMessage } from "../components/JobStatusBadge";
import { api } from "../lib/bridge";
import { navigate } from "../lib/router";
import { useJobs, type JobState } from "../stores/jobs";
import { useUi } from "../stores/ui";
import { toolById } from "./tools";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: "8px" },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  head: { display: "flex", alignItems: "center", gap: "10px" },
  icon: { color: tokens.colorNeutralForeground2, display: "grid", placeItems: "center" },
  titles: { flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1, wordBreak: "break-word" },
  actions: { display: "flex", gap: "4px", justifyContent: "flex-end" },
  footer: { display: "flex", justifyContent: "flex-end", paddingTop: "8px" },
});

function elapsed(job: JobState): string {
  const end = job.finishedAt ?? Date.now() / 1000;
  const s = Math.max(0, Math.round(end - job.startedAt));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function JobItem({ job }: { job: JobState }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const setOpen = useUi((s) => s.setJobsOpen);
  const tool = toolById(job.kind.split(".")[0]);
  const Icon = tool?.icon;
  const message = jobMessage(t, job);

  return (
    <div className={styles.item}>
      <div className={styles.head}>
        <span className={styles.icon}>{Icon && <Icon />}</span>
        <div className={styles.titles}>
          <Text weight="semibold" className={styles.ellipsis}>
            {tool ? t(`tools.${tool.id}.name`) : job.kind}
          </Text>
          {job.title && job.title !== job.kind && (
            <Caption1 className={`${styles.muted} ${styles.ellipsis}`} title={job.title}>
              {job.title}
            </Caption1>
          )}
        </div>
        <JobStatusBadge status={job.status} />
      </div>
      {job.status === "running" && <ProgressBar value={job.percent == null ? undefined : job.percent / 100} thickness="medium" />}
      {message && <Caption1 className={job.status === "error" ? styles.error : styles.muted}>{message}</Caption1>}
      <div className={styles.actions}>
        <Caption1 className={styles.muted} style={{ marginRight: "auto", alignSelf: "center" }}>
          {elapsed(job)}
        </Caption1>
        {job.status === "running" && (
          <Button size="small" appearance="subtle" icon={<Dismiss16Regular />} onClick={() => api.jobs.cancel(job.id)}>
            {t("common.cancel")}
          </Button>
        )}
        {tool && (
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowRight16Regular />}
            iconPosition="after"
            onClick={() => {
              navigate(tool.id);
              setOpen(false);
            }}
          >
            {t("jobs.openTool")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function JobsPanel() {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = useUi((s) => s.jobsOpen);
  const setOpen = useUi((s) => s.setJobsOpen);
  const jobs = useJobs(useShallow((s) => s.order.map((id) => s.jobs[id]).filter((j) => !j.dismissed)));
  const clearFinished = useJobs((s) => s.clearFinished);
  const finished = jobs.filter((j) => j.status !== "running").length;

  return (
    <OverlayDrawer position="end" size="medium" open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" aria-label={t("common.close")} icon={<Dismiss24Regular />} onClick={() => setOpen(false)} />}
        >
          {t("jobs.title")}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {jobs.length === 0 ? (
          <EmptyState icon={TaskListLtr24Regular} title={t("jobs.emptyTitle")}>
            {t("jobs.emptyBody")}
          </EmptyState>
        ) : (
          <>
            <div className={styles.list}>
              {jobs.map((job) => (
                <JobItem key={job.id} job={job} />
              ))}
            </div>
            {finished > 0 && (
              <div className={styles.footer}>
                <Tooltip content={t("jobs.clearHint")} relationship="description">
                  <Button appearance="subtle" icon={<Delete16Regular />} onClick={clearFinished}>
                    {t("jobs.clearFinished")}
                  </Button>
                </Tooltip>
              </div>
            )}
          </>
        )}
      </DrawerBody>
    </OverlayDrawer>
  );
}

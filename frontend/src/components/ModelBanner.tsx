// Prompt to download an optional AI model or dependency, with in-place install progress.

import { useEffect, useState } from "react";
import {
  Button,
  makeStyles,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
} from "@fluentui/react-components";
import { ArrowDownload16Regular, Dismiss16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { useJob } from "../stores/jobs";
import { useNotify } from "./notify";

const useStyles = makeStyles({
  progress: { marginTop: "6px" },
});

interface ModelBannerProps {
  /** Dependency id passed to `system.install_dependency`. */
  depId: string;
  title: string;
  description: string;
  installLabel: string;
  readyMessage: string;
  onInstalled: () => void;
}

export function ModelBanner({ depId, title, description, installLabel, readyMessage, onInstalled }: ModelBannerProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  useEffect(() => {
    if (!job) return;
    if (job.status === "done") {
      notify.success(readyMessage);
      onInstalled();
      setJobId(null);
    } else if (job.status === "error") {
      notify.error(t("settings.deps.failed"), { body: job.error ?? undefined });
    }
  }, [job?.status, job?.error, notify, onInstalled, readyMessage, t]);

  const install = async () => {
    try {
      setJobId(await api.system.installDependency(depId));
    } catch (err) {
      notify.error(t("settings.deps.failed"), { body: String(err) });
    }
  };

  const running = job?.status === "running";

  return (
    <MessageBar intent="info" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>{title}</MessageBarTitle>
        {running ? (job.message ? t(job.message, job.params) : t("settings.deps.installing")) : description}
        {running && <ProgressBar className={styles.progress} value={job.percent != null ? job.percent / 100 : undefined} />}
      </MessageBarBody>
      <MessageBarActions>
        {running ? (
          <Button size="small" icon={<Dismiss16Regular />} onClick={() => jobId && api.jobs.cancel(jobId)}>
            {t("common.cancel")}
          </Button>
        ) : (
          <Button size="small" appearance="primary" icon={<ArrowDownload16Regular />} onClick={install}>
            {installLabel}
          </Button>
        )}
      </MessageBarActions>
    </MessageBar>
  );
}

// Prompt to download an optional AI model or dependency, with in-place install progress.

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
import { jobMessage } from "../lib/jobMessage";
import { useInstallJob } from "../lib/useInstallJob";
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
  const { job, install, cancel } = useInstallJob(depId, {
    onInstalled: () => {
      notify.success(readyMessage);
      onInstalled();
    },
    onFailed: (message) => notify.error(t("settings.deps.failed"), { body: message }),
  });

  return (
    <MessageBar intent="info" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>{title}</MessageBarTitle>
        {job ? jobMessage(t, job) || t("settings.deps.installing") : description}
        {job && <ProgressBar className={styles.progress} value={job.percent != null ? job.percent / 100 : undefined} />}
      </MessageBarBody>
      <MessageBarActions>
        {job ? (
          <Button size="small" icon={<Dismiss16Regular />} onClick={cancel}>
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

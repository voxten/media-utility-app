import { Button, Caption1, ProgressBar } from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { jobMessage } from "../../../lib/jobMessage";
import type { JobState } from "../../../stores/jobs";
import { useSettingsStyles } from "./styles";

export function InstallProgress({ job, onCancel }: { job: JobState; onCancel: () => void }) {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  return (
    <div className={styles.depProgress}>
      <div className={styles.depProgressHeader}>
        <Caption1 className={styles.progressStatus}>
          {jobMessage(t, job) || t("settings.deps.installing")}
        </Caption1>
        <Button appearance="subtle" size="small" icon={<Dismiss16Regular />} onClick={onCancel} title={t("common.cancel")} />
      </div>
      <ProgressBar value={job.percent != null ? job.percent / 100 : undefined} />
    </div>
  );
}

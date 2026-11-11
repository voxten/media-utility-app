import { useEffect } from "react";
import { Badge, Button, Skeleton, SkeletonItem, Spinner, Switch } from "@fluentui/react-components";
import {
  ArrowClockwise16Regular,
  ArrowDownload16Regular,
  ArrowDownload24Regular,
  ArrowSync16Regular,
  ArrowSync24Regular,
  ArrowUndo16Regular,
  CheckmarkCircle16Filled,
  CloudArrowDown24Regular,
  Warning16Filled,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../components/notify";
import { Section } from "../../../components/Page";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { api } from "../../../lib/bridge";
import { errorMessage } from "../../../lib/errors";
import type { EngineInfo } from "../../../lib/types";
import { useEngines } from "../../../stores/engines";
import { useJob } from "../../../stores/jobs";
import { useSettings } from "../../../stores/settings";
import { InstallProgress } from "./InstallProgress";
import { useSettingsStyles } from "./styles";

function EngineBadge({ engine }: { engine: EngineInfo }) {
  const { t } = useTranslation();
  if (engine.restartRequired) {
    return (
      <Badge appearance="tint" color="informative">
        {t("settings.engines.afterRestart")}
      </Badge>
    );
  }
  if (engine.updateAvailable) {
    return (
      <Badge appearance="tint" color="warning" icon={<Warning16Filled />}>
        {t("settings.engines.newVersion", { version: engine.latest })}
      </Badge>
    );
  }
  if (engine.latest) {
    return (
      <Badge appearance="tint" color="success" icon={<CheckmarkCircle16Filled />}>
        {t("settings.engines.upToDate")}
      </Badge>
    );
  }
  return null;
}

export function EnginesSection() {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  const notify = useNotify();
  const settings = useSettings((s) => s.settings)!;
  const updateSettings = useSettings((s) => s.update);
  const { engines, jobId, checking, load, check, update, reset } = useEngines();
  const job = useJob(jobId);
  const running = job?.status === "running";

  useEffect(() => {
    load().catch(() => useEngines.setState({ engines: [] }));
  }, [load, job?.status]);

  const run = (action: () => Promise<void>, error: string) => () => {
    action().catch((err) => notify.error(t(error), { body: errorMessage(t, err) }));
  };

  const list = engines ?? [];
  const canUpdate = !running && list.some((e) => e.updateAvailable);
  const needsRestart = list.some((e) => e.restartRequired);
  const canRestore = !running && list.some((e) => e.downloaded);

  return (
    <Section
      title={t("settings.engines.title")}
      actions={
        <div className={styles.actionRow}>
          {canRestore && (
            <Button appearance="subtle" size="small" icon={<ArrowUndo16Regular />} onClick={run(reset, "engines.failed")}>
              {t("settings.engines.restore")}
            </Button>
          )}
          <Button
            appearance="subtle"
            size="small"
            icon={checking ? <Spinner size="extra-tiny" /> : <ArrowSync16Regular />}
            disabled={checking || running}
            onClick={run(check, "settings.engines.checkFailed")}
          >
            {t("settings.engines.check")}
          </Button>
          {canUpdate && (
            <Button appearance="primary" size="small" icon={<ArrowDownload16Regular />} onClick={run(update, "engines.failed")}>
              {t("engines.update")}
            </Button>
          )}
          {needsRestart && !running && (
            <Button appearance="primary" size="small" icon={<ArrowClockwise16Regular />} onClick={run(api.system.restart, "engines.failed")}>
              {t("engines.restart")}
            </Button>
          )}
        </div>
      }
    >
      <SettingGroup>
        {!engines ? (
          <Skeleton>
            <SkeletonItem size={64} />
          </Skeleton>
        ) : (
          engines.map((engine) => (
            <SettingRow
              key={engine.id}
              icon={CloudArrowDown24Regular}
              title={engine.id}
              description={engine.version ? t("settings.version", { version: engine.version }) : undefined}
            >
              <EngineBadge engine={engine} />
            </SettingRow>
          ))
        )}
        {running && (
          <SettingRow icon={ArrowDownload24Regular} title={t("engines.updateTitle")}>
            <InstallProgress job={job} onCancel={() => api.jobs.cancel(job.id)} />
          </SettingRow>
        )}
        <SettingRow icon={ArrowSync24Regular} title={t("settings.engines.autoCheck")}>
          <Switch
            checked={settings.engineUpdateCheck ?? true}
            onChange={(_, d) => updateSettings({ engineUpdateCheck: d.checked })}
          />
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

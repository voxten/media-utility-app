import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Skeleton, SkeletonItem, Spinner } from "@fluentui/react-components";
import {
  ArrowDownload16Regular,
  ArrowMaximize24Regular,
  ArrowSync16Regular,
  Bot24Regular,
  CheckmarkCircle16Filled,
  ClosedCaption24Regular,
  Info24Regular,
  Video24Regular,
  Warning16Filled,
  WrenchScrewdriver24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../components/notify";
import { Section } from "../../../components/Page";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { api } from "../../../lib/bridge";
import type { Dependency } from "../../../lib/types";
import { useInstallJob } from "../../../lib/useInstallJob";
import { InstallProgress } from "./InstallProgress";
import { useSettingsStyles } from "./styles";

const DEP_ICONS: Record<string, typeof Video24Regular> = {
  ffmpeg: Video24Regular,
  mediainfo: Info24Regular,
  lama: Bot24Regular,
  upscale_general: ArrowMaximize24Regular,
  upscale_anime: ArrowMaximize24Regular,
  rembg: Bot24Regular,
  whisper_base: ClosedCaption24Regular,
  whisper_small: ClosedCaption24Regular,
  whisper_turbo: ClosedCaption24Regular,
};

function DependencyRowItem({ dep, onRefresh }: { dep: Dependency; onRefresh: () => void }) {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  const notify = useNotify();
  const { job, install, cancel } = useInstallJob(dep.id, {
    onInstalled: () => {
      notify.success(t("settings.deps.installed"), { body: t(`settings.deps.${dep.id}`) });
      onRefresh();
    },
    onFailed: (message) => notify.error(t("settings.deps.failed"), { body: message }),
  });

  const tools = dep.usedBy.map((id) => t(`tools.${id}.name`)).join(", ");
  const detailText = dep.detail ? (dep.detail.startsWith("settings.") ? t(dep.detail) : dep.detail) : "";

  return (
    <SettingRow
      key={dep.id}
      icon={DEP_ICONS[dep.id] ?? WrenchScrewdriver24Regular}
      title={t(`settings.deps.${dep.id}`, { defaultValue: dep.id })}
      description={
        <>
          {t("settings.usedBy", { tools })}
          {detailText && (
            <>
              <br />
              <span className={styles.depDetail}>{detailText}</span>
            </>
          )}
        </>
      }
    >
      {job ? (
        <InstallProgress job={job} onCancel={cancel} />
      ) : dep.ok ? (
        <Badge appearance="tint" color="success" icon={<CheckmarkCircle16Filled />}>
          {t("settings.depOk")}
        </Badge>
      ) : (
        <div className={styles.depActions}>
          <Badge appearance="tint" color={dep.required ? "danger" : "warning"} icon={<Warning16Filled />}>
            {dep.required ? t("settings.depMissing") : t("settings.depOptional")}
          </Badge>
          {dep.installable && (
            <Button appearance="primary" size="small" icon={<ArrowDownload16Regular />} onClick={install}>
              {t("settings.deps.install")} {dep.sizeEstimate ? `(${dep.sizeEstimate})` : ""}
            </Button>
          )}
        </div>
      )}
    </SettingRow>
  );
}

export function DependenciesSection() {
  const { t } = useTranslation();
  const [deps, setDeps] = useState<Dependency[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [data] = await Promise.all([
        api.system.dependencies(),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
      setDeps(data);
    } catch {
      setDeps((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.system.dependencies()
      .then((data) => {
        if (active) setDeps(data);
      })
      .catch(() => {
        if (active) setDeps([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Section
      title={t("settings.dependencies")}
      actions={
        <Button
          appearance="subtle"
          size="small"
          icon={refreshing ? <Spinner size="extra-tiny" /> : <ArrowSync16Regular />}
          disabled={refreshing}
          onClick={refresh}
        >
          {t("settings.refresh")}
        </Button>
      }
    >
      <SettingGroup>
        {!deps ? (
          <Skeleton>
            <SkeletonItem size={64} />
          </Skeleton>
        ) : (
          deps.map((dep) => (
            <DependencyRowItem key={dep.id} dep={dep} onRefresh={refresh} />
          ))
        )}
      </SettingGroup>
    </Section>
  );
}

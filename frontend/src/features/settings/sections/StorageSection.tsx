import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowDownload24Regular,
  Bot24Regular,
  Database24Regular,
  Delete16Regular,
  DocumentText24Regular,
  FolderOpen16Regular,
  HardDrive24Regular,
  History24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../components/notify";
import { Section } from "../../../components/Page";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { api } from "../../../lib/bridge";
import { useOpenPath } from "../../../lib/useOpenPath";
import { errorMessage } from "../../../lib/errors";
import { formatBytes } from "../../../lib/format";
import type { StorageInfo } from "../../../lib/types";
import { useSettings } from "../../../stores/settings";

export function StorageSection() {
  const { t } = useTranslation();
  const { openPath } = useOpenPath();
  const notify = useNotify();
  const settings = useSettings((s) => s.settings);
  const clearRecentFolders = useSettings((s) => s.clearRecentFolders);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [clearing, setClearing] = useState(false);
  const [archiveCount, setArchiveCount] = useState(0);

  const loadStorage = useCallback(async () => {
    try {
      const data = await api.system.storageInfo();
      setStorage(data);
    } catch {
      // Storage stats are optional; the section renders without them.
    }
  }, []);

  useEffect(() => {
    loadStorage();
    api.download.archiveCount().then(setArchiveCount).catch(() => setArchiveCount(0));
  }, [loadStorage]);

  const handleClearArchive = async () => {
    try {
      await api.download.clearArchive();
      setArchiveCount(0);
      notify.success(t("settings.storage.archiveCleared"));
    } catch (err) {
      notify.error(errorMessage(t, err));
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const res = await api.system.clearCache();
      notify.success(t("settings.storage.cacheCleared", { size: formatBytes(res.freedBytes) }));
      await loadStorage();
    } catch (err) {
      notify.error(errorMessage(t, err));
    } finally {
      setClearing(false);
    }
  };

  const handleOpenAppData = async () => {
    try {
      await api.system.openAppData();
    } catch (err) {
      notify.error(errorMessage(t, err));
    }
  };

  const handleOpenLogs = () => api.system.openLogs().catch((err) => notify.error(errorMessage(t, err)));

  const handleClearRecent = async () => {
    try {
      await clearRecentFolders();
      notify.success(t("settings.storage.recentCleared"));
    } catch (err) {
      notify.error(errorMessage(t, err));
    }
  };

  return (
    <Section title={t("settings.storage.title")}>
      <SettingGroup>
        <SettingRow
          icon={Database24Regular}
          title={t("settings.storage.cacheTitle")}
          description={
            storage
              ? t("settings.storage.usage", { size: formatBytes(storage.cacheBytes), count: storage.cacheFiles })
              : t("settings.storage.cacheDesc")
          }
        >
          <Button
            appearance="secondary"
            size="medium"
            icon={clearing ? <Spinner size="extra-tiny" /> : <Delete16Regular />}
            disabled={clearing || !storage || storage.cacheBytes === 0}
            onClick={handleClearCache}
          >
            {clearing ? t("settings.storage.clearingCache") : t("settings.storage.clearCache")}
          </Button>
        </SettingRow>

        {storage && (
          <SettingRow
            icon={Bot24Regular}
            title={t("settings.storage.modelsTitle")}
            description={`${t("settings.storage.usage", { size: formatBytes(storage.modelsBytes), count: storage.modelsFiles })} · ${storage.modelsDir}`}
          >
            <Button
              appearance="subtle"
              size="medium"
              icon={<FolderOpen16Regular />}
              onClick={() => openPath(storage.modelsDir)}
            >
              {t("settings.storage.openFolder")}
            </Button>
          </SettingRow>
        )}

        <SettingRow
          icon={HardDrive24Regular}
          title={t("settings.storage.appDataTitle")}
          description={
            storage
              ? `${t("settings.storage.usage", { size: formatBytes(storage.totalAppDataBytes), count: storage.totalAppDataFiles })} · ${storage.appDataDir}`
              : t("settings.storage.appDataDesc")
          }
        >
          <Button
            appearance="subtle"
            size="medium"
            icon={<FolderOpen16Regular />}
            onClick={handleOpenAppData}
          >
            {t("settings.storage.openFolder")}
          </Button>
        </SettingRow>

        <SettingRow icon={DocumentText24Regular} title={t("settings.storage.logsTitle")} description={t("settings.storage.logsDesc")}>
          <Button appearance="subtle" size="medium" icon={<FolderOpen16Regular />} onClick={handleOpenLogs}>
            {t("settings.storage.openFolder")}
          </Button>
        </SettingRow>

        <SettingRow
          icon={ArrowDownload24Regular}
          title={t("settings.storage.archiveTitle")}
          description={t("settings.storage.archiveDesc", { count: archiveCount })}
        >
          <Button appearance="subtle" size="medium" icon={<Delete16Regular />} disabled={!archiveCount} onClick={handleClearArchive}>
            {t("settings.storage.clearArchive")}
          </Button>
        </SettingRow>

        <SettingRow
          icon={History24Regular}
          title={t("settings.storage.recentFoldersTitle")}
          description={t("settings.storage.recentFoldersDesc", { count: settings?.recentFolders.length ?? 0 })}
        >
          <Button
            appearance="subtle"
            size="medium"
            icon={<Delete16Regular />}
            disabled={!settings?.recentFolders.length}
            onClick={handleClearRecent}
          >
            {t("settings.storage.clearRecent")}
          </Button>
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

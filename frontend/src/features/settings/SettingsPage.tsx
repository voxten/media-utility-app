import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  makeStyles,
  Option,
  ProgressBar,
  Skeleton,
  SkeletonItem,
  Spinner,
  Switch,
  tokens,
} from "@fluentui/react-components";
import {
  AlertBadge24Regular,
  ArrowDownload16Regular,
  ArrowMaximize24Regular,
  ArrowReset24Regular,
  ArrowSync16Regular,
  Bot24Regular,
  CheckmarkCircle16Filled,
  Cookies24Regular,
  DarkTheme24Regular,
  Database24Regular,
  Delete16Regular,
  Desktop24Regular,
  DeveloperBoard24Regular,
  Dismiss16Regular,
  Folder24Regular,
  FolderOpen16Regular,
  HardDrive24Regular,
  History24Regular,
  Info24Regular,
  LocalLanguage24Regular,
  Server24Regular,
  Settings24Filled,
  Flash24Regular,
  Color24Regular,
  Speaker216Regular,
  Speaker224Regular,
  Video24Regular,
  Warning16Filled,
  Warning24Regular,
  WrenchScrewdriver24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import { Page, Section } from "../../components/Page";
import { PathPicker } from "../../components/PathPicker";
import { SettingGroup, SettingRow } from "../../components/SettingRow";
import { api, getBackendMode } from "../../lib/bridge";
import { dialogFilter } from "../../lib/fileTypes";
import { formatBytes } from "../../lib/format";
import type { AppInfo, Dependency, HardwareInfo, Language, StorageInfo, ThemePreference } from "../../lib/types";
import { playChime, showDesktopNotification, useJob } from "../../stores/jobs";
import { useSettings } from "../../stores/settings";
import { useUi } from "../../stores/ui";

const useStyles = makeStyles({
  dropdown: { minWidth: "180px", maxWidth: "100%" },
  cookieRows: { display: "flex", flexDirection: "column", gap: "8px", width: "100%", minWidth: 0 },
  cookieRow: {
    display: "grid",
    gridTemplateColumns: "110px minmax(0, 1fr)",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
    "@media (max-width: 600px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: "4px",
    },
  },
  hint: { color: tokens.colorNeutralForeground3 },
  depDetail: { color: tokens.colorNeutralForeground3, wordBreak: "break-all" },
  depActions: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" },
  depProgress: { display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px", maxWidth: "320px" },
  depProgressHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  progressStatus: { color: tokens.colorNeutralForeground2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  storageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "12px",
    marginBottom: "12px",
  },
  storageCard: {
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  storageCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: tokens.colorNeutralForeground2,
  },
  storageCardValue: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  hardwareBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
});

const DEP_ICONS: Record<string, typeof Video24Regular> = {
  ffmpeg: Video24Regular,
  mediainfo: Info24Regular,
  lama: Bot24Regular,
  upscale_general: ArrowMaximize24Regular,
  upscale_anime: ArrowMaximize24Regular,
  rembg: Bot24Regular,
};

function DependencyRowItem({ dep, onRefresh }: { dep: Dependency; onRefresh: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  useEffect(() => {
    if (!job) return;
    if (job.status === "done") {
      notify.success(t("settings.deps.installed"), { body: t(`settings.deps.${dep.id}`) });
      onRefresh();
      setJobId(null);
    } else if (job.status === "error") {
      notify.error(t("settings.deps.failed"), { body: job.error ?? undefined });
    }
  }, [job?.status, job?.error, dep.id, notify, onRefresh, t]);

  const handleInstall = async () => {
    try {
      const id = await api.system.installDependency(dep.id);
      setJobId(id);
    } catch (err) {
      notify.error(t("settings.deps.failed"), { body: String(err) });
    }
  };

  const handleCancel = async () => {
    if (jobId) {
      await api.jobs.cancel(jobId);
    }
  };

  const tools = dep.usedBy.map((id) => t(`tools.${id}.name`)).join(", ");
  const detailText = dep.detail ? (dep.detail.startsWith("settings.") ? t(dep.detail) : dep.detail) : "";
  const isRunning = job?.status === "running";

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
      {isRunning ? (
        <div className={styles.depProgress}>
          <div className={styles.depProgressHeader}>
            <Caption1 className={styles.progressStatus}>
              {job.message ? t(job.message, job.params) : t("settings.deps.installing")}
            </Caption1>
            <Button
              appearance="subtle"
              size="small"
              icon={<Dismiss16Regular />}
              onClick={handleCancel}
              title={t("common.cancel")}
            />
          </div>
          <ProgressBar value={job.percent != null ? job.percent / 100 : undefined} />
        </div>
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
            <Button appearance="primary" size="small" icon={<ArrowDownload16Regular />} onClick={handleInstall}>
              {t("settings.deps.install")} {dep.sizeEstimate ? `(${dep.sizeEstimate})` : ""}
            </Button>
          )}
        </div>
      )}
    </SettingRow>
  );
}

function DependenciesSection() {
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

function StorageSection() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const settings = useSettings((s) => s.settings);
  const clearRecentFolders = useSettings((s) => s.clearRecentFolders);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [clearing, setClearing] = useState(false);

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
  }, [loadStorage]);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const res = await api.system.clearCache();
      notify.success(t("settings.storage.cacheCleared", { size: formatBytes(res.freedBytes) }));
      await loadStorage();
    } catch (err) {
      notify.error(String(err));
    } finally {
      setClearing(false);
    }
  };

  const handleOpenAppData = async () => {
    try {
      await api.system.openAppData();
    } catch (err) {
      notify.error(String(err));
    }
  };

  const handleClearRecent = async () => {
    try {
      await clearRecentFolders();
      notify.success(t("settings.storage.recentCleared"));
    } catch (err) {
      notify.error(String(err));
    }
  };

  return (
    <Section title={t("settings.storage.title")}>
      {storage && (
        <div className={styles.storageGrid}>
          <div className={styles.storageCard}>
            <div className={styles.storageCardHeader}>
              <Database24Regular />
              <Caption1>{t("settings.storage.cacheTitle")}</Caption1>
            </div>
            <div className={styles.storageCardValue}>{formatBytes(storage.cacheBytes)}</div>
            <Caption1 className={styles.hint}>{storage.cacheFiles} {t("settings.storage.cacheDesc")}</Caption1>
          </div>

          <div className={styles.storageCard}>
            <div className={styles.storageCardHeader}>
              <Bot24Regular />
              <Caption1>{t("settings.storage.modelsTitle")}</Caption1>
            </div>
            <div className={styles.storageCardValue}>{formatBytes(storage.modelsBytes)}</div>
            <Caption1 className={styles.hint}>{storage.modelsFiles} {t("settings.storage.modelsTitle")}</Caption1>
          </div>

          <div className={styles.storageCard}>
            <div className={styles.storageCardHeader}>
              <HardDrive24Regular />
              <Caption1>{t("settings.storage.appDataTitle")}</Caption1>
            </div>
            <div className={styles.storageCardValue}>{formatBytes(storage.totalAppDataBytes)}</div>
            <Caption1 className={styles.hint}>{storage.totalAppDataFiles} {t("settings.storage.appDataTitle")}</Caption1>
          </div>
        </div>
      )}

      <SettingGroup>
        <SettingRow
          icon={Database24Regular}
          title={t("settings.storage.cacheTitle")}
          description={t("settings.storage.cacheDesc")}
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

        <SettingRow
          icon={HardDrive24Regular}
          title={t("settings.storage.appDataTitle")}
          description={storage?.appDataDir || t("settings.storage.appDataDesc")}
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

function HardwareSection() {
  const { t } = useTranslation();
  const styles = useStyles();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    api.system.hardwareInfo().then(setHardware).catch(() => undefined);
  }, []);

  const concurrencyOptions = [1, 2, 4, 6, 8, 12, 16];

  return (
    <Section title={t("settings.hardware.title")}>
      <SettingGroup>
        <SettingRow
          icon={Desktop24Regular}
          title={hardware?.cpuName || t("settings.hardware.cpu")}
          description={
            hardware
              ? t("settings.hardware.cpuDetails", {
                  threads: hardware.cpuThreads,
                  arch: hardware.cpuArchitecture,
                })
              : undefined
          }
        />

        <SettingRow
          icon={DeveloperBoard24Regular}
          title={
            hardware?.gpus.length
              ? hardware.gpus.join(", ")
              : t("settings.hardware.noGpu")
          }
          description={
            hardware?.cudaAvailable
              ? t("settings.hardware.cudaActive", { version: hardware.cudaVersion || "CUDA" })
              : t("settings.hardware.cudaInactive")
          }
        />

        {hardware && hardware.ramTotalBytes > 0 && (
          <SettingRow
            icon={Server24Regular}
            title={t("settings.hardware.ram")}
            description={t("settings.hardware.ramDetails", {
              avail: formatBytes(hardware.ramAvailBytes),
              total: formatBytes(hardware.ramTotalBytes),
            })}
          />
        )}

        <SettingRow
          icon={Server24Regular}
          title={t("settings.hardware.concurrency")}
          description={t("settings.hardware.concurrencyDesc")}
        >
          <Dropdown
            className={styles.dropdown}
            value={t("settings.hardware.concurrencyThreads", { count: settings.maxConcurrency ?? 4 })}
            selectedOptions={[String(settings.maxConcurrency ?? 4)]}
            onOptionSelect={(_, data) => update({ maxConcurrency: Number(data.optionValue) })}
          >
            {concurrencyOptions.map((opt) => (
              <Option key={opt} value={String(opt)}>
                {t("settings.hardware.concurrencyThreads", { count: opt })}
              </Option>
            ))}
          </Dropdown>
        </SettingRow>

        <SettingRow
          icon={Flash24Regular}
          title={t("settings.hardware.acceleration")}
          description={t("settings.hardware.accelerationDesc")}
        >
          <Switch
            checked={settings.hardwareAcceleration ?? true}
            onChange={(_, d) => update({ hardwareAcceleration: d.checked })}
          />
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();
  const notify = useNotify();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);

  const handleTestNotification = () => {
    playChime("done");
    showDesktopNotification(t("app.name"), t("settings.notifications.testSent"));
    notify.success(t("settings.notifications.testSent"));
  };

  return (
    <Section title={t("settings.notifications.title")}>
      <SettingGroup>
        <SettingRow
          icon={AlertBadge24Regular}
          title={t("settings.notifications.desktop")}
          description={t("settings.notifications.desktopDesc")}
        >
          <Switch
            checked={settings.desktopNotifications ?? true}
            onChange={(_, d) => update({ desktopNotifications: d.checked })}
          />
        </SettingRow>

        <SettingRow
          icon={Speaker224Regular}
          title={t("settings.notifications.sound")}
          description={t("settings.notifications.soundDesc")}
        >
          <>
            <Button
              appearance="subtle"
              size="small"
              icon={<Speaker216Regular />}
              onClick={handleTestNotification}
            >
              {t("settings.notifications.test")}
            </Button>
            <Switch
              checked={settings.completionSound ?? true}
              onChange={(_, d) => update({ completionSound: d.checked })}
            />
          </>
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

function AdvancedSection() {
  const { t } = useTranslation();
  const notify = useNotify();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const reset = useSettings((s) => s.reset);
  const [resetting, setResetting] = useState(false);
  const [openResetDialog, setOpenResetDialog] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      await reset();
      setOpenResetDialog(false);
      notify.success(t("settings.advanced.resetSuccess"));
    } catch (err) {
      notify.error(String(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <Section title={t("settings.advanced.title")}>
      <SettingGroup>
        <SettingRow
          icon={WrenchScrewdriver24Regular}
          title={t("settings.advanced.customFfmpeg")}
          description={t("settings.advanced.customFfmpegDesc")}
          wide
        >
          <PathPicker
            mode="file"
            fileTypes={[dialogFilter(t, "executables")]}
            value={settings.customFfmpegPath || ""}
            placeholder={t("common.notSet")}
            clearable
            onChange={(customFfmpegPath) => update({ customFfmpegPath })}
          />
        </SettingRow>

        <SettingRow
          icon={Warning24Regular}
          title={t("settings.advanced.confirmExit")}
          description={t("settings.advanced.confirmExitDesc")}
        >
          <Switch
            checked={settings.confirmExitOnActiveJobs ?? true}
            onChange={(_, d) => update({ confirmExitOnActiveJobs: d.checked })}
          />
        </SettingRow>

        <SettingRow
          icon={ArrowReset24Regular}
          title={t("settings.advanced.resetSettings")}
          description={t("settings.advanced.resetSettingsDesc")}
        >
          <Dialog open={openResetDialog} onOpenChange={(_, data) => setOpenResetDialog(data.open)}>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="subtle" icon={<ArrowReset24Regular />}>
                {t("settings.advanced.resetBtn")}
              </Button>
            </DialogTrigger>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>{t("settings.advanced.resetConfirmTitle")}</DialogTitle>
                <DialogContent>
                  <Body1>{t("settings.advanced.resetConfirmBody")}</Body1>
                </DialogContent>
                <DialogActions>
                  <DialogTrigger disableButtonEnhancement>
                    <Button appearance="secondary">{t("common.cancel")}</Button>
                  </DialogTrigger>
                  <Button
                    appearance="primary"
                    disabled={resetting}
                    onClick={handleReset}
                  >
                    {t("settings.advanced.resetConfirmAction")}
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const micaSupported = useUi((s) => s.micaSupported);
  const micaActive = useUi((s) => s.mica);

  useEffect(() => {
    api.app.info().then(setInfo).catch(() => undefined);
  }, []);

  const themes: ThemePreference[] = ["system", "light", "dark"];
  const languages: { id: Language; label: string }[] = [
    { id: "pl", label: "Polski" },
    { id: "en", label: "English" },
  ];

  return (
    <Page title={t("settings.title")} description={t("settings.subtitle")} icon={Settings24Filled} accent="#5b6b7f">
      <Section title={t("settings.appearance")}>
        <SettingGroup>
          <SettingRow icon={DarkTheme24Regular} title={t("settings.theme")} description={t("settings.themeDescription")}>
            <Dropdown
              className={styles.dropdown}
              value={t(`settings.themes.${settings.theme}`)}
              selectedOptions={[settings.theme]}
              onOptionSelect={(_, data) => update({ theme: data.optionValue as ThemePreference })}
            >
              {themes.map((theme) => (
                <Option key={theme} value={theme}>
                  {t(`settings.themes.${theme}`)}
                </Option>
              ))}
            </Dropdown>
          </SettingRow>
          <SettingRow icon={LocalLanguage24Regular} title={t("settings.language")} description={t("settings.languageDescription")}>
            <Dropdown
              className={styles.dropdown}
              value={languages.find((l) => l.id === settings.language)?.label}
              selectedOptions={[settings.language]}
              onOptionSelect={(_, data) => update({ language: data.optionValue as Language })}
            >
              {languages.map((lang) => (
                <Option key={lang.id} value={lang.id}>
                  {lang.label}
                </Option>
              ))}
            </Dropdown>
          </SettingRow>
          <SettingRow
            icon={Color24Regular}
            title={t("settings.mica")}
            description={
              !micaSupported
                ? t("settings.micaUnsupported")
                : settings.mica !== micaActive
                  ? t("settings.micaRestart")
                  : t("settings.micaDescription")
            }
          >
            <Switch checked={!!settings.mica} disabled={!micaSupported} onChange={(_, d) => update({ mica: d.checked })} />
          </SettingRow>
        </SettingGroup>
      </Section>

      <Section title={t("settings.files")}>
        <SettingGroup>
          <SettingRow icon={Folder24Regular} title={t("settings.outputDir")} description={t("settings.outputDirDescription")} wide>
            <PathPicker value={settings.outputDir} onChange={(outputDir) => update({ outputDir })} openable />
          </SettingRow>
          <SettingRow icon={Cookies24Regular} title={t("settings.cookies")} description={t("settings.cookiesDescription")} wide>
            <div className={styles.cookieRows}>
              {(["youtube", "x"] as const).map((site) => (
                <div key={site} className={styles.cookieRow}>
                  <Caption1>{t(site === "youtube" ? "settings.cookiesYoutube" : "settings.cookiesX")}</Caption1>
                  <PathPicker
                    mode="file"
                    fileTypes={[dialogFilter(t, "cookies")]}
                    value={settings.cookies[site]}
                    placeholder={t("common.notSet")}
                    clearable
                    onChange={(path) => update({ cookies: { ...settings.cookies, [site]: path } })}
                  />
                </div>
              ))}
              <Caption1 className={styles.hint}>{t("settings.cookiesHint")}</Caption1>
            </div>
          </SettingRow>
        </SettingGroup>
      </Section>

      <StorageSection />

      <HardwareSection />

      <NotificationsSection />

      <DependenciesSection />

      <AdvancedSection />

      <Section title={t("settings.about")}>
        <SettingGroup>
          <SettingRow
            icon={Info24Regular}
            title={`${t("app.name")} · ${t("settings.version", { version: info?.version ?? "…" })}`}
            description={
              getBackendMode() === "mock"
                ? t("settings.backendMock")
                : `${t("settings.python", { version: info?.python ?? "…" })} · ${info?.platform ?? ""}`
            }
          />
        </SettingGroup>
      </Section>
    </Page>
  );
}

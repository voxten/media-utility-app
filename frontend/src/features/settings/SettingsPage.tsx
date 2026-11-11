import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  makeStyles,
  ProgressBar,
  Skeleton,
  SkeletonItem,
  Spinner,
  Switch,
  tokens,
} from "@fluentui/react-components";
import {
  AlertBadge24Regular,
  ArrowClockwise16Regular,
  ArrowDownload16Regular,
  ArrowDownload24Regular,
  ArrowMaximize24Regular,
  ArrowMinimize24Regular,
  ClipboardLink24Regular,
  ArrowReset24Regular,
  ArrowSync16Regular,
  ArrowSync24Regular,
  ArrowUndo16Regular,
  Bot24Regular,
  CheckmarkCircle16Filled,
  ClosedCaption24Regular,
  CloudArrowDown24Regular,
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
import { SETTINGS_ACCENT } from "../../app/tools";
import { confirm } from "../../components/ConfirmDialog";
import { useNotify } from "../../components/notify";
import { showWhatsNew } from "../../components/WhatsNewDialog";
import { Page, Section } from "../../components/Page";
import { PathPicker } from "../../components/PathPicker";
import { Select } from "../../components/Select";
import { SettingGroup, SettingRow } from "../../components/SettingRow";
import { api, getBackendMode } from "../../lib/bridge";
import { dialogFilter } from "../../lib/fileTypes";
import { formatBytes } from "../../lib/format";
import type { AppInfo, Dependency, EngineInfo, HardwareInfo, Language, StorageInfo, ThemePreference } from "../../lib/types";
import { useEngines } from "../../stores/engines";
import { playChime, showDesktopNotification, useJob } from "../../stores/jobs";
import { useSettings } from "../../stores/settings";
import { useUi } from "../../stores/ui";

const COOKIE_SITES = ["youtube", "x", "instagram"] as const;

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
  whisper_base: ClosedCaption24Regular,
  whisper_small: ClosedCaption24Regular,
  whisper_turbo: ClosedCaption24Regular,
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

function EnginesSection() {
  const { t } = useTranslation();
  const styles = useStyles();
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
    action().catch((err) => notify.error(t(error), { body: String(err) }));
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
            <div className={styles.depProgress}>
              <div className={styles.depProgressHeader}>
                <Caption1 className={styles.progressStatus}>
                  {job.message ? t(job.message, job.params) : t("settings.deps.installing")}
                </Caption1>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Dismiss16Regular />}
                  onClick={() => api.jobs.cancel(job.id)}
                  title={t("common.cancel")}
                />
              </div>
              <ProgressBar value={job.percent != null ? job.percent / 100 : undefined} />
            </div>
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

function StorageSection() {
  const { t } = useTranslation();
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
            description={t("settings.storage.usage", { size: formatBytes(storage.modelsBytes), count: storage.modelsFiles })}
          />
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
          <Select
            className={styles.dropdown}
            options={concurrencyOptions.map((n) => ({ value: String(n), label: t("settings.hardware.concurrencyThreads", { count: n }) }))}
            value={String(settings.maxConcurrency ?? 4)}
            onChange={(v) => update({ maxConcurrency: Number(v) })}
          />
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
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);

  const soundOn = settings.completionSound ?? true;
  const desktopOn = settings.desktopNotifications ?? true;

  const handleTestNotification = () => {
    if (soundOn) playChime("done");
    if (desktopOn) showDesktopNotification(t("app.name"), t("settings.notifications.testSent"), true);
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
            checked={desktopOn}
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
              disabled={!soundOn && !desktopOn}
              onClick={handleTestNotification}
            >
              {t("settings.notifications.test")}
            </Button>
            <Switch
              checked={soundOn}
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
  const handleReset = async () => {
    const ok = await confirm({
      title: t("settings.advanced.resetConfirmTitle"),
      body: t("settings.advanced.resetConfirmBody"),
      confirmLabel: t("settings.advanced.resetConfirmAction"),
      danger: true,
    });
    if (!ok) return;
    try {
      await reset();
      notify.success(t("settings.advanced.resetSuccess"));
    } catch (err) {
      notify.error(String(err));
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
          icon={ArrowMinimize24Regular}
          title={t("settings.advanced.closeToTray")}
          description={t("settings.advanced.closeToTrayDesc")}
        >
          <Switch
            checked={settings.closeToTray ?? true}
            onChange={(_, d) => update({ closeToTray: d.checked })}
          />
        </SettingRow>

        <SettingRow
          icon={ClipboardLink24Regular}
          title={t("settings.advanced.clipboardWatch")}
          description={t("settings.advanced.clipboardWatchDesc")}
        >
          <Switch checked={settings.clipboardWatch ?? false} onChange={(_, d) => update({ clipboardWatch: d.checked })} />
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
          <Button appearance="subtle" icon={<ArrowReset24Regular />} onClick={handleReset}>
            {t("settings.advanced.resetBtn")}
          </Button>
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
    <Page title={t("settings.title")} description={t("settings.subtitle")} icon={Settings24Filled} accent={SETTINGS_ACCENT}>
      <Section title={t("settings.appearance")}>
        <SettingGroup>
          <SettingRow icon={DarkTheme24Regular} title={t("settings.theme")} description={t("settings.themeDescription")}>
            <Select
              className={styles.dropdown}
              options={themes.map((theme) => ({ value: theme, label: t(`settings.themes.${theme}`) }))}
              value={settings.theme}
              onChange={(theme) => update({ theme })}
            />
          </SettingRow>
          <SettingRow icon={LocalLanguage24Regular} title={t("settings.language")} description={t("settings.languageDescription")}>
            <Select
              className={styles.dropdown}
              options={languages.map((l) => ({ value: l.id, label: l.label }))}
              value={settings.language}
              onChange={(language) => update({ language })}
            />
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
              {COOKIE_SITES.map((site) => (
                <div key={site} className={styles.cookieRow}>
                  <Caption1>{t(`settings.cookieSites.${site}`)}</Caption1>
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

      <EnginesSection />

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
          >
            <Button onClick={showWhatsNew}>{t("whatsNew.title")}</Button>
          </SettingRow>
        </SettingGroup>
      </Section>
    </Page>
  );
}

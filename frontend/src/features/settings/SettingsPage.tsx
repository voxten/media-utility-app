import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Dropdown,
  makeStyles,
  Option,
  ProgressBar,
  Skeleton,
  SkeletonItem,
  Switch,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowDownload16Regular,
  ArrowMaximize24Regular,
  ArrowSync16Regular,
  Bot24Regular,
  CheckmarkCircle16Filled,
  Cookies24Regular,
  DarkTheme24Regular,
  Dismiss16Regular,
  Folder24Regular,
  Info24Regular,
  LocalLanguage24Regular,
  Settings24Filled,
  Sparkle24Regular,
  Video24Regular,
  Warning16Filled,
  WrenchScrewdriver24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import { Page, Section } from "../../components/Page";
import { PathPicker } from "../../components/PathPicker";
import { SettingGroup, SettingRow } from "../../components/SettingRow";
import { api, getBackendMode } from "../../lib/bridge";
import type { AppInfo, Dependency, Language, ThemePreference } from "../../lib/types";
import { useJob } from "../../stores/jobs";
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
});

const DEP_ICONS: Record<string, typeof Video24Regular> = {
  ffmpeg: Video24Regular,
  mediainfo: Info24Regular,
  lama: Bot24Regular,
  upscale_general: ArrowMaximize24Regular,
  upscale_anime: Sparkle24Regular,
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

function DependencyRows() {
  const { t } = useTranslation();
  const [deps, setDeps] = useState<Dependency[] | null>(null);

  const refresh = useCallback(() => {
    setDeps(null);
    api.system.dependencies().then(setDeps).catch(() => setDeps([]));
  }, []);
  useEffect(refresh, [refresh]);

  if (!deps) {
    return (
      <Skeleton>
        <SkeletonItem size={64} />
      </Skeleton>
    );
  }

  return (
    <>
      {deps.map((dep) => (
        <DependencyRowItem key={dep.id} dep={dep} onRefresh={refresh} />
      ))}
      <div>
        <Button appearance="subtle" icon={<ArrowSync16Regular />} onClick={refresh}>
          {t("settings.refresh")}
        </Button>
      </div>
    </>
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
            icon={Sparkle24Regular}
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
                    fileTypes={["Cookies (*.txt)"]}
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

      <Section title={t("settings.dependencies")}>
        <SettingGroup>
          <DependencyRows />
        </SettingGroup>
      </Section>

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

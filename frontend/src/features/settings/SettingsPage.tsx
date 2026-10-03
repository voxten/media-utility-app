import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Dropdown,
  makeStyles,
  Option,
  Skeleton,
  SkeletonItem,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowSync16Regular,
  Bot24Regular,
  CheckmarkCircle16Filled,
  Cookies24Regular,
  DarkTheme24Regular,
  Folder24Regular,
  Info24Regular,
  LocalLanguage24Regular,
  Settings24Filled,
  Video24Regular,
  Warning16Filled,
  WrenchScrewdriver24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Page, Section } from "../../components/Page";
import { PathPicker } from "../../components/PathPicker";
import { SettingGroup, SettingRow } from "../../components/SettingRow";
import { api, getBackendMode } from "../../lib/bridge";
import type { AppInfo, Dependency, Language, ThemePreference } from "../../lib/types";
import { useSettings } from "../../stores/settings";

const useStyles = makeStyles({
  dropdown: { minWidth: "180px" },
  cookieRows: { display: "flex", flexDirection: "column", gap: "8px", width: "100%" },
  cookieRow: { display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: "12px" },
  hint: { color: tokens.colorNeutralForeground3 },
  depDetail: { color: tokens.colorNeutralForeground3, wordBreak: "break-all" },
});

const DEP_ICONS: Record<string, typeof Video24Regular> = {
  ffmpeg: Video24Regular,
  mediainfo: Info24Regular,
  lama: Bot24Regular,
};

function DependencyRows() {
  const { t } = useTranslation();
  const styles = useStyles();
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
      {deps.map((dep) => {
        const tools = dep.usedBy.map((id) => t(`tools.${id}.name`)).join(", ");
        return (
          <SettingRow
            key={dep.id}
            icon={DEP_ICONS[dep.id] ?? WrenchScrewdriver24Regular}
            title={t(`settings.deps.${dep.id}`, { defaultValue: dep.id })}
            description={
              <>
                {t("settings.usedBy", { tools })}
                {dep.detail && (
                  <>
                    <br />
                    <span className={styles.depDetail}>{dep.detail}</span>
                  </>
                )}
              </>
            }
          >
            {dep.ok ? (
              <Badge appearance="tint" color="success" icon={<CheckmarkCircle16Filled />}>
                {t("settings.depOk")}
              </Badge>
            ) : (
              <Badge appearance="tint" color={dep.required ? "danger" : "warning"} icon={<Warning16Filled />}>
                {dep.required ? t("settings.depMissing") : t("settings.depOptional")}
              </Badge>
            )}
          </SettingRow>
        );
      })}
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

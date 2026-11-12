import { Caption1 } from "@fluentui/react-components";
import { Cookies24Regular, Folder24Regular, Globe24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/Page";
import { PathPicker } from "../../../components/PathPicker";
import { Select } from "../../../components/Select";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { dialogFilter } from "../../../lib/fileTypes";
import { useSettings } from "../../../stores/settings";
import { useSettingsStyles } from "./styles";

const COOKIE_SITES = ["youtube", "x", "instagram"] as const;
const BROWSERS = ["", "firefox", "chrome", "edge", "brave", "opera", "vivaldi"] as const;

export function FilesSection() {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);

  return (
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
        <SettingRow icon={Globe24Regular} title={t("settings.cookiesFromBrowser")} description={t("settings.cookiesFromBrowserDescription")}>
          <Select
            options={BROWSERS.map((value) => ({
              value,
              label: value ? t(`settings.browsers.${value}`) : t("settings.browsers.off"),
            }))}
            value={settings.cookiesFromBrowser}
            onChange={(cookiesFromBrowser) => update({ cookiesFromBrowser })}
          />
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

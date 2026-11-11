import { Switch } from "@fluentui/react-components";
import { Color24Regular, DarkTheme24Regular, LocalLanguage24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/Page";
import { Select } from "../../../components/Select";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import type { Language, ThemePreference } from "../../../lib/types";
import { useSettings } from "../../../stores/settings";
import { useUi } from "../../../stores/ui";
import { useSettingsStyles } from "./styles";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGES: { id: Language; label: string }[] = [
  { id: "pl", label: "Polski" },
  { id: "en", label: "English" },
];

export function AppearanceSection() {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const micaSupported = useUi((s) => s.micaSupported);
  const micaActive = useUi((s) => s.mica);

  return (
    <Section title={t("settings.appearance")}>
      <SettingGroup>
        <SettingRow icon={DarkTheme24Regular} title={t("settings.theme")} description={t("settings.themeDescription")}>
          <Select
            className={styles.dropdown}
            options={THEMES.map((theme) => ({ value: theme, label: t(`settings.themes.${theme}`) }))}
            value={settings.theme}
            onChange={(theme) => update({ theme })}
          />
        </SettingRow>
        <SettingRow icon={LocalLanguage24Regular} title={t("settings.language")} description={t("settings.languageDescription")}>
          <Select
            className={styles.dropdown}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
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
  );
}

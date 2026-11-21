import { useEffect } from "react";
import { ColorSwatch, Switch, SwatchPicker, Tooltip } from "@fluentui/react-components";
import {
  Color24Regular,
  DarkTheme24Regular,
  LocalLanguage24Regular,
  SlideTransition24Regular,
  WindowBrush24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ACCENT_PRESETS, APP_ACCENT } from "../../../app/theme";
import { Section } from "../../../components/Page";
import { Select } from "../../../components/Select";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { api } from "../../../lib/bridge";
import type { Accent, Backdrop, Language, ThemePreference } from "../../../lib/types";
import { useSettings } from "../../../stores/settings";
import { useUi } from "../../../stores/ui";
import { useSettingsStyles } from "./styles";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const BACKDROPS: Backdrop[] = ["mica", "micaAlt", "none"];
const LANGUAGES: { id: Language; label: string }[] = [
  { id: "pl", label: "Polski" },
  { id: "en", label: "English" },
];

interface AccentSwatch {
  value: Accent;
  name: string;
  color: string;
}

function AccentPicker() {
  const { t } = useTranslation();
  const accent = useSettings((s) => s.settings?.accent ?? "app");
  const update = useSettings((s) => s.update);
  const systemAccent = useUi((s) => s.systemAccent);

  useEffect(() => {
    useUi.getState().refreshSystemAccent();
  }, []);

  const swatches: AccentSwatch[] = [
    { value: "app", name: "app", color: APP_ACCENT },
    ...(systemAccent ? [{ value: "system" as const, name: "system", color: systemAccent }] : []),
    ...Object.entries(ACCENT_PRESETS).map(([name, color]) => ({ value: color, name, color })),
  ];

  return (
    <SwatchPicker
      aria-label={t("settings.accent")}
      shape="circular"
      size="small"
      selectedValue={accent}
      onSelectionChange={(_, d) => {
        const swatch = swatches.find((s) => s.value === d.selectedValue);
        if (swatch) update({ accent: swatch.value });
      }}
    >
      {swatches.map((swatch) => (
        <Tooltip key={swatch.value} content={t(`settings.accents.${swatch.name}`)} relationship="label">
          <ColorSwatch value={swatch.value} color={swatch.color} />
        </Tooltip>
      ))}
    </SwatchPicker>
  );
}

export function AppearanceSection() {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const micaSupported = useUi((s) => s.micaSupported);
  const transparent = useUi((s) => s.mica);
  const backdrop = micaSupported ? settings.backdrop : "none";

  const changeBackdrop = (next: Backdrop) => {
    update({ backdrop: next });
    if (next !== "none" && transparent) api.app.setBackdrop(next).catch(() => undefined);
  };

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
        <SettingRow icon={Color24Regular} title={t("settings.accent")} description={t("settings.accentDescription")}>
          <AccentPicker />
        </SettingRow>
        <SettingRow
          icon={WindowBrush24Regular}
          title={t("settings.backdrop")}
          description={
            !micaSupported
              ? t("settings.micaUnsupported")
              : (backdrop !== "none") !== transparent
                ? t("settings.micaRestart")
                : t(`settings.backdropDescriptions.${backdrop}`)
          }
        >
          <Select
            className={styles.dropdown}
            options={BACKDROPS.map((kind) => ({ value: kind, label: t(`settings.backdrops.${kind}`) }))}
            value={backdrop}
            disabled={!micaSupported}
            onChange={changeBackdrop}
          />
        </SettingRow>
        <SettingRow icon={SlideTransition24Regular} title={t("settings.animations")} description={t("settings.animationsDescription")}>
          <Switch checked={settings.animations} onChange={(_, d) => update({ animations: d.checked })} />
        </SettingRow>
        <SettingRow icon={LocalLanguage24Regular} title={t("settings.language")} description={t("settings.languageDescription")}>
          <Select
            className={styles.dropdown}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
            value={settings.language}
            onChange={(language) => update({ language })}
          />
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

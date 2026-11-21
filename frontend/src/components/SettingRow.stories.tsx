import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "@fluentui/react-components";
import { DarkTheme24Regular, Folder24Regular, LocalLanguage24Regular, SlideTransition24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { PathPicker } from "./PathPicker";
import { Select } from "./Select";
import { SettingGroup, SettingRow } from "./SettingRow";

const meta = {
  title: "Components/SettingRow",
  component: SettingRow,
  args: { title: "" },
} satisfies Meta<typeof SettingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Group: Story = {
  render: function Render() {
    const { t } = useTranslation();
    const [theme, setTheme] = useState("system");
    const [language, setLanguage] = useState("pl");
    const [animations, setAnimations] = useState(true);
    const [folder, setFolder] = useState("C:\\Users\\demo\\Downloads");
    return (
      <SettingGroup>
        <SettingRow icon={DarkTheme24Regular} title={t("settings.theme")} description={t("settings.themeDescription")}>
          <Select
            value={theme}
            onChange={setTheme}
            options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: t(`settings.themes.${v}`) }))}
          />
        </SettingRow>
        <SettingRow icon={LocalLanguage24Regular} title={t("settings.language")} description={t("settings.languageDescription")}>
          <Select
            value={language}
            onChange={setLanguage}
            options={[
              { value: "pl", label: "Polski" },
              { value: "en", label: "English" },
            ]}
          />
        </SettingRow>
        <SettingRow icon={SlideTransition24Regular} title={t("settings.animations")} description={t("settings.animationsDescription")}>
          <Switch checked={animations} onChange={(_, d) => setAnimations(d.checked)} />
        </SettingRow>
        <SettingRow icon={Folder24Regular} title={t("common.outputFolder")} wide>
          <PathPicker value={folder} onChange={setFolder} openable />
        </SettingRow>
      </SettingGroup>
    );
  },
};

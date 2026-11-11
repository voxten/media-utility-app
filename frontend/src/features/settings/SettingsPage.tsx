import { Settings24Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { SETTINGS_ACCENT } from "../../app/tools";
import { Page } from "../../components/Page";
import { AboutSection } from "./sections/AboutSection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { DependenciesSection } from "./sections/DependenciesSection";
import { EnginesSection } from "./sections/EnginesSection";
import { FilesSection } from "./sections/FilesSection";
import { HardwareSection } from "./sections/HardwareSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { StorageSection } from "./sections/StorageSection";

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Page title={t("settings.title")} description={t("settings.subtitle")} icon={Settings24Filled} accent={SETTINGS_ACCENT}>
      <AppearanceSection />
      <FilesSection />
      <StorageSection />
      <HardwareSection />
      <NotificationsSection />
      <DependenciesSection />
      <EnginesSection />
      <AdvancedSection />
      <AboutSection />
    </Page>
  );
}

import { Button, Switch } from "@fluentui/react-components";
import { AlertBadge24Regular, Speaker216Regular, Speaker224Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/Page";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { playChime, showDesktopNotification } from "../../../stores/jobs";
import { useSettings } from "../../../stores/settings";

export function NotificationsSection() {
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

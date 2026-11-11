import { Button, Switch } from "@fluentui/react-components";
import {
  ArrowMinimize24Regular,
  ArrowReset24Regular,
  ClipboardLink24Regular,
  Warning24Regular,
  WrenchScrewdriver24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { confirm } from "../../../components/ConfirmDialog";
import { useNotify } from "../../../components/notify";
import { Section } from "../../../components/Page";
import { PathPicker } from "../../../components/PathPicker";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { errorMessage } from "../../../lib/errors";
import { dialogFilter } from "../../../lib/fileTypes";
import { useSettings } from "../../../stores/settings";

export function AdvancedSection() {
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
      notify.error(errorMessage(t, err));
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
            onChange={(customFfmpegPath) =>
              update({ customFfmpegPath }).catch(() => notify.error(t("settings.advanced.customFfmpegInvalid")))
            }
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

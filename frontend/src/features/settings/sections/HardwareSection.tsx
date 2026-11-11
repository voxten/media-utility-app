import { useEffect, useState } from "react";
import { Desktop24Regular, DeveloperBoard24Regular, Server24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/Page";
import { Select } from "../../../components/Select";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { api } from "../../../lib/bridge";
import { formatBytes } from "../../../lib/format";
import type { HardwareInfo } from "../../../lib/types";
import { useSettings } from "../../../stores/settings";
import { useSettingsStyles } from "./styles";

const CONCURRENCY_OPTIONS = [1, 2, 4, 6, 8, 12, 16];

export function HardwareSection() {
  const { t } = useTranslation();
  const styles = useSettingsStyles();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    api.system.hardwareInfo().then(setHardware).catch(() => undefined);
  }, []);

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
            options={CONCURRENCY_OPTIONS.map((n) => ({ value: String(n), label: t("settings.hardware.concurrencyTasks", { count: n }) }))}
            value={String(settings.maxConcurrency ?? 4)}
            onChange={(v) => update({ maxConcurrency: Number(v) })}
          />
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

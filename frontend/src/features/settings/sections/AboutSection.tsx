import { useEffect, useState } from "react";
import { Button } from "@fluentui/react-components";
import { Info24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/Page";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { showWhatsNew } from "../../../components/WhatsNewDialog";
import { api, getBackendMode } from "../../../lib/bridge";
import type { AppInfo } from "../../../lib/types";

export function AboutSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    api.app.info().then(setInfo).catch(() => undefined);
  }, []);

  return (
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
        >
          <Button onClick={showWhatsNew}>{t("whatsNew.title")}</Button>
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

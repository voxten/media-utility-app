import { Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowDownload16Regular, Bookmark24Regular, Copy16Regular, Keyboard24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../components/notify";
import { Section } from "../../../components/Page";
import { Select } from "../../../components/Select";
import { SettingGroup, SettingRow } from "../../../components/SettingRow";
import { BOOKMARKLET, startBookmarkDrag } from "../../../lib/bookmarklet";
import { errorMessage } from "../../../lib/errors";
import type { GlobalHotkey } from "../../../lib/types";
import { useSettings } from "../../../stores/settings";
import { useUi } from "../../../stores/ui";
import { useSettingsStyles } from "./styles";

const useStyles = makeStyles({
  bookmark: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    cursor: "grab",
    userSelect: "none",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    ":active": { cursor: "grabbing" },
  },
  stack: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 },
  hotkey: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" },
  taken: { color: tokens.colorPaletteRedForeground1 },
});

const HOTKEYS: GlobalHotkey[] = ["", "ctrl+alt+d", "ctrl+alt+shift+d", "ctrl+alt+y", "ctrl+alt+shift+y"];

const hotkeyLabel = (combo: string) =>
  combo
    .split("+")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("+");

export function BrowserSection() {
  const { t } = useTranslation();
  const styles = useStyles();
  const settingsStyles = useSettingsStyles();
  const notify = useNotify();
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const taken = useUi((s) => s.hotkeyTaken);
  const title = t("settings.browser.bookmarkName");

  const copy = () =>
    navigator.clipboard
      ?.writeText(BOOKMARKLET)
      .then(() => notify.success(t("settings.browser.copied")))
      .catch(() => undefined);

  const setHotkey = (globalHotkey: GlobalHotkey) =>
    update({ globalHotkey })
      .then(() => useUi.setState({ hotkeyTaken: "" }))
      .catch((err: unknown) => {
        if (String(err instanceof Error ? err.message : err).includes("errors.hotkeyTaken")) {
          useUi.setState({ hotkeyTaken: globalHotkey });
        } else {
          notify.error(errorMessage(t, err));
        }
      });

  return (
    <Section title={t("settings.browser.title")}>
      <SettingGroup>
        <SettingRow
          icon={Bookmark24Regular}
          title={t("settings.browser.bookmark")}
          description={t("settings.browser.bookmarkDesc")}
          wide
        >
          <div className={styles.stack}>
            <div className={settingsStyles.actionRow}>
              <span
                className={styles.bookmark}
                draggable
                onDragStart={(event) => startBookmarkDrag(event, title)}
              >
                <ArrowDownload16Regular />
                {title}
              </span>
              <Button appearance="subtle" icon={<Copy16Regular />} onClick={copy}>
                {t("common.copy")}
              </Button>
            </div>
            <Caption1 className={settingsStyles.hint}>{t("settings.browser.copyHint")}</Caption1>
          </div>
        </SettingRow>

        <SettingRow icon={Keyboard24Regular} title={t("settings.browser.hotkey")} description={t("settings.browser.hotkeyDesc")}>
          <div className={styles.hotkey}>
            <Select
              options={HOTKEYS.map((value) => ({
                value,
                label: value ? hotkeyLabel(value) : t("settings.browser.hotkeyOff"),
              }))}
              value={settings.globalHotkey ?? ""}
              onChange={setHotkey}
            />
            {taken && (
              <Caption1 className={styles.taken}>{t("settings.browser.hotkeyTaken", { hotkey: hotkeyLabel(taken) })}</Caption1>
            )}
          </div>
        </SettingRow>
      </SettingGroup>
    </Section>
  );
}

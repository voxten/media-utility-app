// Release notes dialog. A single <WhatsNewHost /> is mounted in the shell; it also points the user to the notes
// once after the app was updated.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { api } from "../lib/bridge";
import { getChangelog } from "../lib/changelog";
import { useSettings } from "../stores/settings";
import { useNotify } from "./notify";

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "100%" },
  content: { maxHeight: "min(64vh, 600px)", overflowY: "auto", paddingRight: "4px" },
  header: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap", minWidth: 0 },
  date: { color: tokens.colorNeutralForeground3 },
  panel: { display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "12px" },
  section: { display: "flex", flexDirection: "column", gap: "4px" },
  sectionTitle: { color: tokens.colorNeutralForeground2 },
  list: { margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" },
  code: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    padding: "0 4px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

const useWhatsNewStore = create<{ open: boolean }>(() => ({ open: false }));

export function showWhatsNew() {
  useWhatsNewStore.setState({ open: true });
}

/** `**bold**` and `code` spans, the only inline markup the changelogs use. */
function Inline({ text, codeClass }: { text: string; codeClass: string }) {
  const parts: ReactNode[] = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className={codeClass}>{part.slice(1, -1)}</code>;
    return part;
  });
  return <>{parts}</>;
}

function formatDate(date: string, language: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

let updateChecked = false;

export function WhatsNewHost() {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const open = useWhatsNewStore((s) => s.open);
  const language = useSettings((s) => s.settings?.language ?? "pl");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const releases = useMemo(() => getChangelog(language), [language]);

  useEffect(() => {
    if (updateChecked) return;
    updateChecked = true;
    api.app
      .info()
      .then((info) => {
        setCurrentVersion(info.version);
        const { settings, update } = useSettings.getState();
        const seen = settings?.lastSeenVersion ?? "";
        if (!info.version || seen === info.version) return;
        update({ lastSeenVersion: info.version }).catch(() => undefined);
        // A fresh install has nothing to catch up on; only an update gets the reminder.
        if (seen) {
          notify.info(t("whatsNew.updated", { version: info.version }), {
            action: { label: t("whatsNew.title"), onClick: showWhatsNew },
            timeout: 10000,
          });
        }
      })
      .catch(() => undefined);
  }, [notify, t]);

  return (
    <Dialog open={open} onOpenChange={(_, d) => useWhatsNewStore.setState({ open: d.open })}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle
            action={
              <DialogTrigger action="close">
                <Button appearance="subtle" aria-label={t("common.close")} icon={<Dismiss24Regular />} />
              </DialogTrigger>
            }
          >
            {t("whatsNew.title")}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Accordion multiple collapsible defaultOpenItems={releases[0] ? [releases[0].version] : []}>
              {releases.map((release) => (
                <AccordionItem key={release.version} value={release.version}>
                  <AccordionHeader>
                    <span className={styles.header}>
                      <Body1Strong>{t("settings.version", { version: release.version })}</Body1Strong>
                      <Caption1 className={styles.date}>{formatDate(release.date, language)}</Caption1>
                      {release.version === currentVersion && (
                        <Badge appearance="tint" size="small">
                          {t("whatsNew.current")}
                        </Badge>
                      )}
                    </span>
                  </AccordionHeader>
                  <AccordionPanel className={styles.panel}>
                    {release.sections.map((section) => (
                      <div key={section.title} className={styles.section}>
                        <Body1Strong className={styles.sectionTitle}>{section.title}</Body1Strong>
                        <ul className={styles.list}>
                          {section.items.map((item, i) => (
                            <li key={i}>
                              <Body1>
                                <Inline text={item} codeClass={styles.code} />
                              </Body1>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// Downloads only part of a single video: a time range typed as 1:23, or one of its chapters.

import { Field, Input, makeStyles, Switch } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { Select } from "../../components/Select";
import { formatDuration, parseTime } from "../../lib/format";
import { useDownloadForm } from "./store";
import type { ProbeResult } from "./types";

const useStyles = makeStyles({
  times: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
});

/** The range to send, or null for the whole video (switch off or an empty range). */
export function clipSection(clip: boolean, start: string, end: string, duration: number | null) {
  if (!clip) return null;
  const from = parseTime(start) ?? 0;
  const to = parseTime(end) ?? duration ?? 0;
  return to > from ? { start: from, end: to } : null;
}

export function ClipField({ probe }: { probe: ProbeResult }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { clip, clipStart, clipEnd, set } = useDownloadForm();
  const chapters = probe.chapters ?? [];
  const duration = probe.duration ?? 0;
  const invalid = clip && (parseTime(clipStart || "0") == null || (clipEnd !== "" && parseTime(clipEnd) == null));
  const chapterIndex = chapters.findIndex(
    (c) => parseTime(clipStart) === Math.round(c.start) && parseTime(clipEnd) === Math.round(c.end),
  );

  return (
    <>
      <Switch label={t("download.clip.title")} checked={clip} onChange={(_, d) => set({ clip: d.checked })} />
      {clip && (
        <>
          {chapters.length > 0 && (
            <Field label={t("download.clip.chapter")}>
              <Select
                searchable={chapters.length > 8}
                placeholder={t("download.clip.pickChapter")}
                options={chapters.map((c, i) => ({ value: String(i), label: `${formatDuration(c.start)} ${c.title}` }))}
                value={chapterIndex >= 0 ? String(chapterIndex) : null}
                onChange={(value) => {
                  const chapter = chapters[Number(value)];
                  set({ clipStart: formatDuration(chapter.start), clipEnd: formatDuration(chapter.end) });
                }}
              />
            </Field>
          )}
          <div className={styles.times}>
            <Field label={t("download.clip.start")} validationState={invalid ? "error" : "none"}>
              <Input value={clipStart} placeholder="0:00" onChange={(_, d) => set({ clipStart: d.value })} />
            </Field>
            <Field label={t("download.clip.end")} validationState={invalid ? "error" : "none"}>
              <Input value={clipEnd} placeholder={formatDuration(duration)} onChange={(_, d) => set({ clipEnd: d.value })} />
            </Field>
          </div>
        </>
      )}
    </>
  );
}

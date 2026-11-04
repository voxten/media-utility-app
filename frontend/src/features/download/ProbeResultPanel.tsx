// Checked link: video or playlist details and the format picker.

import {
  Badge,
  Body1,
  makeStyles,
  Subtitle2,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableSelectionCell,
  TabList,
  Text,
  tokens,
} from "@fluentui/react-components";
import { Clock16Regular, Eye16Regular, Image16Regular, MusicNote224Regular, Person16Regular, Video24Regular, VideoClipMultiple24Regular } from "@fluentui/react-icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { Select } from "../../components/Select";
import { formatName, formatOptions } from "../../lib/fileTypes";
import { formatBytes, formatDuration } from "../../lib/format";
import { useDownloadForm } from "./store";
import type { Format, Mode, ProbeResult } from "./types";

const AUDIO_CODECS = ["mp3", "m4a", "flac", "wav", "aac", "opus"];

const useStyles = makeStyles({
  media: { display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: "20px", alignItems: "start", "@media (max-width: 800px)": { gridTemplateColumns: "1fr" } },
  thumb: { width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow8, backgroundColor: tokens.colorNeutralBackground3 },
  mediaInfo: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 },
  metaRow: { display: "flex", gap: "16px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  meta: { display: "inline-flex", gap: "6px", alignItems: "center" },
  tableWrap: { maxHeight: "320px", overflowY: "auto", borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke3}` },
  row: { cursor: "pointer" },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  formatsHead: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  grow: { flexGrow: 1 },
  codec: { minWidth: "120px" },
  muted: { color: tokens.colorNeutralForeground3 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  playlistHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "8px" },
  playlistEntriesList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "260px",
    overflowY: "auto",
    marginTop: "12px",
    padding: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  playlistEntryItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  entryIdx: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums", minWidth: "28px" },
  recommended: { marginLeft: "8px" },
});

function formatLabel(f: Format, t: TFunction) {
  if (f.kind === "auto") return t("download.auto");
  if (f.kind === "audio") return f.abr ? `${Math.round(f.abr)} kbps` : f.note || t("download.audioOnly");
  return f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}` : f.note || "—";
}

function codecLabel(f: Format) {
  const short = (c: string) => (c && c !== "none" ? c.split(".")[0] : "");
  if (f.kind === "auto") return "";
  return [short(f.vcodec), short(f.acodec)].filter(Boolean).join(" + ");
}

export function ProbeResultPanel({ probe }: { probe: ProbeResult }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const form = useDownloadForm();
  const formats = probe.formats[form.mode] ?? [];

  return (
    <Panel>
      <div className={styles.media}>
        {probe.thumbnail ? <img className={styles.thumb} src={probe.thumbnail} alt="" /> : <div className={styles.thumb} />}
        <div className={styles.mediaInfo}>
          <Subtitle2>{probe.title}</Subtitle2>
          <div className={styles.metaRow}>
            {probe.uploader && (
              <span className={styles.meta}>
                <Person16Regular /> {probe.uploader}
              </span>
            )}
            {probe.duration != null && (
              <span className={styles.meta}>
                <Clock16Regular /> {formatDuration(probe.duration)}
              </span>
            )}
            {probe.viewCount != null && (
              <span className={styles.meta}>
                <Eye16Regular /> {probe.viewCount.toLocaleString()}
              </span>
            )}
            {!!probe.photoCount && (
              <span className={styles.meta}>
                <Image16Regular /> {t("download.photos", { count: probe.photoCount })}
              </span>
            )}
          </div>
          {probe.isPlaylist ? (
            <div>
              <div className={styles.playlistHeader}>
                <Badge appearance="tint" color="brand">
                  {t("download.playlistBadge", { count: probe.entries?.length ?? 0 })}
                </Badge>
              </div>
              {probe.entries && probe.entries.length > 0 && (
                <div className={styles.playlistEntriesList}>
                  {probe.entries.map((entry, idx) => (
                    <div key={entry.url + idx} className={styles.playlistEntryItem}>
                      <Text weight="semibold" className={styles.entryIdx}>
                        #{idx + 1}
                      </Text>
                      <Text className={styles.ellipsis}>{entry.title || entry.url}</Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={styles.formatsHead}>
                <TabList
                  size="small"
                  selectedValue={form.mode}
                  onTabSelect={(_, d) => {
                    const mode = d.value as Mode;
                    form.set({ mode, formatId: probe.formats[mode][0]?.id ?? "" });
                  }}
                >
                  <Tab value="video" icon={<Video24Regular />}>
                    {t("download.modeVideo")}
                  </Tab>
                  <Tab value="audio" icon={<MusicNote224Regular />}>
                    {t("download.modeAudio")}
                  </Tab>
                  <Tab value="muxed" icon={<VideoClipMultiple24Regular />}>
                    {t("download.modeMuxed")}
                  </Tab>
                </TabList>
                <span className={styles.grow} />
                {form.mode === "audio" && (
                  <Select
                    searchable
                    className={styles.codec}
                    options={formatOptions(AUDIO_CODECS)}
                    value={form.audioCodec}
                    onChange={(audioCodec) => form.set({ audioCodec })}
                    aria-label={t("download.audioCodec")}
                  />
                )}
              </div>
              {formats.length === 0 ? (
                <Body1 className={styles.muted}>{t("download.noFormats")}</Body1>
              ) : (
                <div className={styles.tableWrap}>
                  <Table size="small" aria-label={t("download.formats")}>
                    <TableHeader>
                      <TableRow>
                        <TableSelectionCell type="radio" invisible />
                        <TableHeaderCell>{t("download.colQuality")}</TableHeaderCell>
                        <TableHeaderCell>{t("download.colFormat")}</TableHeaderCell>
                        <TableHeaderCell>{t("download.colCodec")}</TableHeaderCell>
                        <TableHeaderCell>{t("download.colSize")}</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formats.map((f) => (
                        <TableRow key={f.id} className={styles.row} onClick={() => form.set({ formatId: f.id })} aria-selected={form.formatId === f.id}>
                          <TableSelectionCell type="radio" checked={form.formatId === f.id} />
                          <TableCell>
                            <Text weight={f.kind === "auto" ? "semibold" : "regular"}>{formatLabel(f, t)}</Text>
                            {f.kind === "auto" && (
                              <Badge appearance="tint" color="brand" size="small" className={styles.recommended}>
                                {t("download.recommended")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatName(f.ext)}</TableCell>
                          <TableCell>
                            <span className={styles.mono}>{codecLabel(f)}</span>
                          </TableCell>
                          <TableCell>{f.filesize ? formatBytes(f.filesize) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

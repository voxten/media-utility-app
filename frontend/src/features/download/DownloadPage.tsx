import { useMemo, useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Dropdown,
  Field,
  Input,
  makeStyles,
  Option,
  ProgressBar,
  Spinner,
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
  Textarea,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowClockwise16Regular,
  ArrowDownload16Filled,
  CheckmarkCircle16Filled,
  Clock16Regular,
  ClipboardPaste16Regular,
  DismissCircle16Filled,
  Eye16Regular,
  FolderOpen16Regular,
  Link24Regular,
  MusicNote224Regular,
  Person16Regular,
  Search16Regular,
  TextBulletListLtr24Regular,
  Video24Regular,
  VideoClipMultiple24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { EmptyState } from "../../components/EmptyState";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { api } from "../../lib/bridge";
import { formatBytes, formatDuration } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";

type Mode = "video" | "audio" | "muxed";

interface Format {
  id: string;
  kind: "auto" | "video" | "audio" | "muxed";
  ext: string;
  height: number | null;
  fps: number | null;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  abr?: number | null;
  note: string;
}

interface PlaylistEntry {
  url: string;
  title: string;
  id: string;
  duration: number | null;
}

interface ProbeResult {
  url: string;
  title: string;
  uploader: string;
  duration: number | null;
  viewCount: number | null;
  thumbnail: string | null;
  isPlaylist?: boolean;
  entries?: PlaylistEntry[];
  formats: Record<Mode, Format[]>;
}

interface BatchItem {
  index: number;
  url: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  title?: string;
  error?: string;
  percent?: number;
}

const AUDIO_CODECS = ["mp3", "m4a", "flac", "wav", "aac", "opus"];
const TEMPLATE_TOKENS = ["{title}", "{id}", "{ext}"];

interface DownloadForm {
  tab: "single" | "batch";
  url: string;
  probe: ProbeResult | null;
  mode: Mode;
  formatId: string;
  audioCodec: string;
  batchText: string;
  outdir: string;
  template: string;
  set: (patch: Partial<Omit<DownloadForm, "set">>) => void;
}

const useForm = create<DownloadForm>((set) => ({
  tab: "single",
  url: "",
  probe: null,
  mode: "video",
  formatId: "",
  audioCodec: "mp3",
  batchText: "",
  outdir: "",
  template: "{title}.{ext}",
  set: (patch) => set(patch),
}));

const useStyles = makeStyles({
  urlRow: { display: "flex", gap: "8px", width: "100%", minWidth: 0 },
  urlInput: { flexGrow: 1, minWidth: 0 },
  searchBtn: { flexShrink: 0, whiteSpace: "nowrap" },
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
  outputGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
    gap: "16px",
    "@media (max-width: 1050px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  templateInput: { width: "100%", minWidth: 0 },
  tokens: { display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap", minWidth: 0 },
  token: { cursor: "pointer", flexShrink: 0 },
  batchPanel: { flexGrow: 1, display: "flex", flexDirection: "column", minHeight: "260px" },
  batchArea: {
    flexGrow: 1,
    minHeight: "180px",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    "& textarea": {
      fontFamily: tokens.fontFamilyMonospace,
      maxHeight: "none",
      minHeight: "inherit",
      boxSizing: "border-box",
      flexGrow: 1,
      height: "100%",
    },
  },
  queue: { display: "flex", flexDirection: "column", gap: "6px" },
  queueItem: {
    display: "grid",
    gridTemplateColumns: "20px minmax(0, 1fr) 140px",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3 },
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
});

function formatLabel(f: Format, t: (k: string, o?: Record<string, unknown>) => string) {
  if (f.kind === "auto") return t("download.auto");
  if (f.kind === "audio") return f.abr ? `${Math.round(f.abr)} kbps` : f.note || t("download.audioOnly");
  return f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}` : f.note || "—";
}

function codecLabel(f: Format) {
  const short = (c: string) => (c && c !== "none" ? c.split(".")[0] : "");
  if (f.kind === "auto") return "";
  return [short(f.vcodec), short(f.acodec)].filter(Boolean).join(" + ");
}

export default function DownloadPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("download")!;
  const form = useForm();
  const defaultOutdir = useSettings((s) => s.settings?.outputDir ?? "");
  const outdir = form.outdir || defaultOutdir;
  const [lastBatch, setLastBatch] = useState<BatchItem[] | null>(null);

  const probe = useJobRunner<ProbeResult>("download.probe", {
    onDone: (result) => {
      const first = result.formats.video[0]?.id ?? "";
      form.set({ probe: result, mode: "video", formatId: first });
    },
    onError: (error) => notify.error(t("download.toast.probeError"), { body: error }),
  });

  const download = useJobRunner<{ title: string; outdir: string }>("download", {
    onDone: (result) =>
      notify.success(t("download.toast.done"), {
        body: result.title,
        action: { label: t("common.openFolder"), onClick: () => api.system.openPath(result.outdir) },
      }),
    onError: (error) => notify.error(t("download.toast.error"), { body: error }),
  });

  const batch = useJobRunner<{ items: BatchItem[]; succeeded: number; failed: number; outdir: string }>("download.batch", {
    onDone: (result) => {
      setLastBatch(result.items);
      const notifyFn = result.failed ? notify.warning : notify.success;
      notifyFn(t("download.toast.batchDone", { ok: result.succeeded, failed: result.failed }), {
        action: { label: t("common.openFolder"), onClick: () => api.system.openPath(result.outdir) },
      });
    },
    onError: (error) => notify.error(t("download.toast.error"), { body: error }),
  });

  const urls = useMemo(() => form.batchText.split(/\r?\n/).map((u) => u.trim()).filter(Boolean), [form.batchText]);

  // Batch queue view: merge streamed per-item partials with the per-item progress.
  const queue = useMemo<(BatchItem & { percent?: number })[]>(() => {
    const items = new Map<number, BatchItem & { percent?: number }>();
    const source = (batch.job?.partials && batch.job.partials.length > 0 ? (batch.job.partials as BatchItem[]) : lastBatch) ?? [];
    if (!batch.job && !lastBatch) {
      urls.forEach((url, index) => items.set(index, { index, url, status: "pending", percent: 0 }));
      return Array.from(items.values());
    }
    source.forEach((p) => items.set(p.index, { ...items.get(p.index), ...p }));
    const extra = batch.job?.status === "running" ? batch.job.extra : {};
    if (typeof extra.item === "number") {
      const cur = items.get(extra.item);
      if (cur) items.set(extra.item, { ...cur, percent: Number(extra.itemPercent ?? 0) });
    }
    return Array.from(items.values()).sort((a, b) => a.index - b.index);
  }, [batch.job, lastBatch, urls]);

  const failedItems = useMemo(() => queue.filter((i) => i.status === "error"), [queue]);

  const retryFailed = () => {
    const targetUrls = failedItems.length > 0 ? failedItems.map((i) => i.url) : urls;
    if (targetUrls.length === 0) return;
    setLastBatch(null);
    batch.start(() => api.download.batch({ urls: targetUrls, outdir, template: form.template })).catch((err) => notify.error(String(err)));
  };

  const activeJob = form.tab === "batch" ? batch.job : download.running ? download.job : probe.running ? probe.job : download.job;
  const running = probe.running || download.running || batch.running;
  const extra = activeJob?.status === "running" ? activeJob.extra : {};
  const detail =
    typeof extra.speed === "number"
      ? `${formatBytes(Number(extra.downloaded))} / ${formatBytes(Number(extra.total))} · ${formatBytes(extra.speed)}/s · ETA ${formatDuration(Number(extra.eta))}`
      : undefined;

  const runProbe = () => {
    if (!form.url.trim()) return;
    form.set({ probe: null, formatId: "" });
    probe.start(() => api.download.probe(form.url.trim())).catch((err) => notify.error(String(err)));
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) form.set({ url: text.trim() });
    } catch {
      /* clipboard not permitted */
    }
  };

  const startDownload = () => {
    if (form.tab === "batch") {
      setLastBatch(null);
      batch.start(() => api.download.batch({ urls, outdir, template: form.template })).catch((err) => notify.error(String(err)));
      return;
    }
    if (!form.probe) return;
    if (form.probe.isPlaylist && form.probe.entries && form.probe.entries.length > 0) {
      const playlistUrls = form.probe.entries.map((e) => e.url);
      form.set({ tab: "batch", batchText: playlistUrls.join("\n") });
      setLastBatch(null);
      batch.start(() => api.download.batch({ urls: playlistUrls, outdir, template: form.template })).catch((err) => notify.error(String(err)));
      return;
    }
    download
      .start(() =>
        api.download.start({
          url: form.probe!.url,
          formatId: form.formatId,
          outdir,
          template: form.template,
          mode: form.mode,
          audioCodec: form.audioCodec,
          title: form.probe!.title,
        }),
      )
      .catch((err) => notify.error(String(err)));
  };

  const formats = form.probe?.formats[form.mode] ?? [];
  const canDownload =
    !running && !!outdir && (form.tab === "batch" ? urls.length > 0 : !!form.probe && (form.probe.isPlaylist || !!form.formatId));

  return (
    <Page title={t("tools.download.name")} description={t("tools.download.description")} icon={tool.icon} accent={tool.accent}>
      <TabList selectedValue={form.tab} onTabSelect={(_, d) => form.set({ tab: d.value as "single" | "batch" })}>
        <Tab value="single" icon={<Link24Regular />}>
          {t("download.single")}
        </Tab>
        <Tab value="batch" icon={<TextBulletListLtr24Regular />}>
          {t("download.batch")}
        </Tab>
      </TabList>

      {form.tab === "single" ? (
        <>
          <Panel>
            <div className={styles.urlRow}>
              <Input
                className={styles.urlInput}
                size="large"
                value={form.url}
                placeholder={t("download.urlPlaceholder")}
                contentBefore={<Link24Regular />}
                contentAfter={
                  <Tooltip content={t("download.paste")} relationship="label">
                    <Button appearance="transparent" size="small" icon={<ClipboardPaste16Regular />} onClick={paste} />
                  </Tooltip>
                }
                onChange={(_, d) => form.set({ url: d.value })}
                onKeyDown={(e) => e.key === "Enter" && runProbe()}
              />
              <Button className={styles.searchBtn} size="large" icon={probe.running ? <Spinner size="tiny" /> : <Search16Regular />} disabled={!form.url.trim() || probe.running} onClick={runProbe}>
                {t("download.check")}
              </Button>
            </div>
            <Caption1 className={styles.muted}>{t("download.urlHint")}</Caption1>
          </Panel>

          {form.probe ? (
            <Panel>
              <div className={styles.media}>
                {form.probe.thumbnail ? <img className={styles.thumb} src={form.probe.thumbnail} alt="" /> : <div className={styles.thumb} />}
                <div className={styles.mediaInfo}>
                  <Subtitle2>{form.probe.title}</Subtitle2>
                  <div className={styles.metaRow}>
                    {form.probe.uploader && (
                      <span className={styles.meta}>
                        <Person16Regular /> {form.probe.uploader}
                      </span>
                    )}
                    {form.probe.duration != null && (
                      <span className={styles.meta}>
                        <Clock16Regular /> {formatDuration(form.probe.duration)}
                      </span>
                    )}
                    {form.probe.viewCount != null && (
                      <span className={styles.meta}>
                        <Eye16Regular /> {form.probe.viewCount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {form.probe.isPlaylist ? (
                    <div>
                      <div className={styles.playlistHeader}>
                        <Badge appearance="tint" color="brand">
                          {t("download.playlistBadge", { count: form.probe.entries?.length ?? 0 })}
                        </Badge>
                      </div>
                      <Caption1 className={styles.muted}>{t("download.playlistHint")}</Caption1>
                      {form.probe.entries && form.probe.entries.length > 0 && (
                        <div className={styles.playlistEntriesList}>
                          {form.probe.entries.map((entry, idx) => (
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
                            form.set({ mode, formatId: form.probe!.formats[mode][0]?.id ?? "" });
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
                          <Dropdown
                            className={styles.codec}
                            value={form.audioCodec.toUpperCase()}
                            selectedOptions={[form.audioCodec]}
                            onOptionSelect={(_, d) => form.set({ audioCodec: d.optionValue! })}
                            aria-label={t("download.audioCodec")}
                          >
                            {AUDIO_CODECS.map((c) => (
                              <Option key={c} value={c}>
                                {c.toUpperCase()}
                              </Option>
                            ))}
                          </Dropdown>
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
                                      <Badge appearance="tint" color="brand" size="small" style={{ marginLeft: 8 }}>
                                        {t("download.recommended")}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>{f.ext.toUpperCase()}</TableCell>
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
          ) : (
            !probe.running && (
              <Panel>
                <EmptyState icon={Video24Regular} title={t("download.emptyTitle")}>
                  {t("download.emptyBody")}
                </EmptyState>
              </Panel>
            )
          )}
        </>
      ) : (
        <Panel
          className={styles.batchPanel}
          title={t("download.queueTitle")}
          actions={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {failedItems.length > 0 && !batch.running && (
                <Button size="small" appearance="subtle" icon={<ArrowClockwise16Regular />} onClick={retryFailed}>
                  {t("download.retryFailed", { count: failedItems.length })}
                </Button>
              )}
              <Badge appearance="tint">{t("download.urlCount", { count: queue.length || urls.length })}</Badge>
            </div>
          }
        >
          <Textarea
            className={styles.batchArea}
            resize="vertical"
            value={form.batchText}
            placeholder={"https://www.youtube.com/watch?v=…\nhttps://x.com/…/status/…"}
            onChange={(_, d) => form.set({ batchText: d.value })}
            disabled={batch.running}
          />
          <Caption1 className={styles.muted}>{t("download.batchHint")}</Caption1>
          {queue.length > 0 && (
            <div className={styles.queue}>
              {queue.map((item) => (
                <div key={item.index} className={styles.queueItem} title={item.error ?? item.url}>
                  {item.status === "done" ? (
                    <CheckmarkCircle16Filled className={styles.ok} />
                  ) : item.status === "error" ? (
                    <DismissCircle16Filled className={styles.bad} />
                  ) : batch.running ? (
                    <Spinner size="extra-tiny" />
                  ) : (
                    <Clock16Regular className={styles.muted} />
                  )}
                  <Text className={styles.ellipsis}>{item.title || item.url}</Text>
                  {item.status === "running" && batch.running ? (
                    <ProgressBar value={(item.percent ?? 0) / 100} />
                  ) : (
                    <Caption1 className={item.status === "error" ? styles.bad : styles.muted}>{t(`download.itemStatus.${item.status}`)}</Caption1>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title={t("download.output")}>
        <div className={styles.outputGrid}>
          <Field label={t("download.outdir")}>
            <PathPicker value={outdir} onChange={(dir) => form.set({ outdir: dir })} openable />
          </Field>
          <Field label={t("download.template")}>
            <Input className={styles.templateInput} value={form.template} onChange={(_, d) => form.set({ template: d.value })} />
            <div className={styles.tokens}>
              {TEMPLATE_TOKENS.map((tok) => (
                <Badge key={tok} appearance="outline" className={styles.token} onClick={() => form.set({ template: form.template + tok })}>
                  {tok}
                </Badge>
              ))}
            </div>
          </Field>
        </div>
      </Panel>

      {activeJob && activeJob.logs.length > 0 && <LogPanel logs={activeJob.logs} />}

      <ActionBar
        job={activeJob?.status === "running" || activeJob?.status === "error" ? activeJob : undefined}
        detail={detail}
        idleText={
          form.tab === "batch"
            ? urls.length
              ? t("download.idle.batch", { count: urls.length })
              : t("download.idle.batchEmpty")
            : form.probe
              ? t("download.idle.ready")
              : t("download.idle.empty")
        }
        onCancel={() => (batch.running ? batch.cancel() : download.running ? download.cancel() : probe.cancel())}
      >
        <Button icon={<FolderOpen16Regular />} disabled={!outdir} onClick={() => api.system.openPath(outdir).catch(() => undefined)}>
          {t("common.openFolder")}
        </Button>
        {form.tab === "batch" && failedItems.length > 0 && !running && (
          <Button icon={<ArrowClockwise16Regular />} onClick={retryFailed}>
            {t("download.retryFailed", { count: failedItems.length })}
          </Button>
        )}
        <Button appearance="primary" icon={<ArrowDownload16Filled />} disabled={!canDownload} onClick={startDownload}>
          {form.tab === "batch"
            ? t("download.downloadAll")
            : form.probe?.isPlaylist
              ? t("download.downloadPlaylist", { count: form.probe.entries?.length ?? 0 })
              : t("download.download")}
        </Button>
      </ActionBar>
    </Page>
  );
}

import { useMemo, useState } from "react";
import { Badge, Button, Field, Input, makeStyles, Spinner, Tab, TabList, Tooltip } from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowClockwise16Regular,
  ArrowDownload16Filled,
  ClipboardPaste16Regular,
  Link24Regular,
  Search16Regular,
  TextBulletListLtr24Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { EmptyState } from "../../components/EmptyState";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { api } from "../../lib/bridge";
import { formatBytes, formatDuration } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";
import { BatchQueue } from "./BatchQueue";
import { ProbeResultPanel } from "./ProbeResultPanel";
import { useDownloadForm } from "./store";
import type { BatchItem, ProbeResult } from "./types";

const TEMPLATE_TOKENS = ["{title}", "{id}", "{ext}"];

interface BatchResult {
  items: BatchItem[];
  succeeded: number;
  failed: number;
  totalSize?: number;
  totalDuration?: number;
  outdir: string;
}

const useStyles = makeStyles({
  urlRow: { display: "flex", gap: "8px", width: "100%", minWidth: 0 },
  urlInput: { flexGrow: 1, minWidth: 0 },
  searchBtn: { flexShrink: 0, whiteSpace: "nowrap" },
  outputGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
    gap: "16px",
    "@media (max-width: 1050px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  templateInput: { width: "100%", minWidth: 0 },
  tokens: { display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap", minWidth: 0 },
  token: { cursor: "pointer", flexShrink: 0 },
});

/** Sum of a per-item number over finished items, preferring the total the backend reported. */
function batchTotal(reported: number | undefined, queue: BatchItem[], key: "size" | "duration") {
  if (typeof reported === "number" && reported > 0) return reported;
  const sum = queue.reduce((acc, it) => acc + (it.status === "done" && typeof it[key] === "number" ? it[key]! : 0), 0);
  return sum > 0 ? sum : undefined;
}

export default function DownloadPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const form = useDownloadForm();
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

  const batch = useJobRunner<BatchResult>("download.batch", {
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
  const queue = useMemo<BatchItem[]>(() => {
    const items = new Map<number, BatchItem>();
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
  const batchResult = batch.job?.result as Partial<BatchResult> | undefined;

  const retryFailed = () => {
    const targetUrls = failedItems.length > 0 ? failedItems.map((i) => i.url) : urls;
    if (targetUrls.length === 0) return;
    setLastBatch(null);
    batch.start(() => api.download.batch({ urls: targetUrls, outdir, template: form.template })).catch((err) => notify.error(String(err)));
  };

  const activeJob = form.tab === "batch" ? batch.job : download.running ? download.job : probe.running ? probe.job : download.job;
  const running = probe.running || download.running || batch.running;
  const extra = activeJob?.status === "running" ? activeJob.extra : {};
  const speed = typeof extra.speed === "number" ? extra.speed : undefined;
  const eta = typeof extra.eta === "number" ? extra.eta : undefined;
  const detail =
    speed != null
      ? `${formatBytes(Number(extra.downloaded))} / ${formatBytes(Number(extra.total))} · ${formatBytes(speed)}/s · ${t("common.eta", { time: formatDuration(Number(eta)) })}`
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
      if (batch.running && batch.jobId) {
        api.download
          .addToBatch({ jobId: batch.jobId, urls })
          .then(() => {
            form.set({ batchText: "" });
            notify.success(t("download.toast.addedToBatch", { count: urls.length }));
          })
          .catch((err) => notify.error(String(err)));
        return;
      }
      setLastBatch(null);
      batch
        .start(() => api.download.batch({ urls, outdir, template: form.template }))
        .then(() => form.set({ batchText: "" }))
        .catch((err) => notify.error(String(err)));
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

  const canDownload =
    form.tab === "batch"
      ? urls.length > 0 && !!outdir
      : !running && !!outdir && !!form.probe && (form.probe.isPlaylist || !!form.formatId);

  return (
    <ToolPage toolId="download">
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
              <Button
                className={styles.searchBtn}
                size="large"
                icon={probe.running ? <Spinner size="tiny" /> : <Search16Regular />}
                disabled={!form.url.trim() || probe.running}
                onClick={runProbe}
              >
                {t("download.check")}
              </Button>
            </div>
          </Panel>

          {form.probe ? (
            <ProbeResultPanel probe={form.probe} />
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
        <BatchQueue
          queue={queue}
          running={batch.running}
          speed={speed}
          eta={eta}
          totalSize={batchTotal(batchResult?.totalSize, queue, "size")}
          totalDuration={batchTotal(batchResult?.totalDuration, queue, "duration")}
        />
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
        {form.tab === "batch" && failedItems.length > 0 && !running && (
          <Button icon={<ArrowClockwise16Regular />} onClick={retryFailed}>
            {t("download.retryFailed", { count: failedItems.length })}
          </Button>
        )}
        <Button
          appearance="primary"
          icon={form.tab === "batch" && batch.running ? <Add16Regular /> : <ArrowDownload16Filled />}
          disabled={!canDownload}
          onClick={startDownload}
        >
          {form.tab === "batch"
            ? batch.running
              ? t("download.addToBatch")
              : t("download.downloadAll")
            : form.probe?.isPlaylist
              ? t("download.downloadPlaylist", { count: form.probe.entries?.length ?? 0 })
              : t("download.download")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

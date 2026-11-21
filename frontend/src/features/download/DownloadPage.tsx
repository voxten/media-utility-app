import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Field,
  InfoLabel,
  Input,
  makeStyles,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Switch,
  Tab,
  TabList,
  Tooltip,
} from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowClockwise16Regular,
  Dismiss16Regular,
  Play16Regular,
  ArrowDownload16Filled,
  ClipboardPaste16Regular,
  Link24Regular,
  Search16Regular,
  TextBulletListLtr24Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { confirm } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { Columns } from "../../components/Columns";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { api } from "../../lib/bridge";
import { formatBytes, formatDuration } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";
import { BatchFormatField } from "./BatchFormatField";
import { BatchQueue } from "./BatchQueue";
import { ProbeResultPanel } from "./ProbeResultPanel";
import { ClipField, clipSection } from "./ClipField";
import { SubtitlesField, useDownloadSubtitles } from "./SubtitlesField";
import { probedForm, useDownloadForm } from "./store";
import type { BatchItem, ProbeResult } from "./types";
import type { PendingQueue } from "../../lib/types";
import { errorMessage } from "../../lib/errors";
import { ResultCard } from "../../components/ResultCard";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { queueOrder, runningItems } from "../../components/jobCard/targets";
import { retryFailedLinks } from "../../stores/jobs";

const TEMPLATE_TOKENS = ["{title}", "{id}", "{ext}"];

interface BatchResult {
  items: BatchItem[];
  succeeded: number;
  failed: number;
  skipped?: number;
  totalSize?: number;
  totalDuration?: number;
  outdir: string;
}

const useStyles = makeStyles({
  urlRow: { display: "flex", gap: "8px", width: "100%", minWidth: 0 },
  urlInput: { flexGrow: 1, minWidth: 0 },
  searchBtn: { flexShrink: 0, whiteSpace: "nowrap" },
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
  const outdir = useOutputDir(form.outdir);
  const lastBatch = form.lastBatch;
  const setLastBatch = (items: BatchItem[] | null) => form.set({ lastBatch: items });
  const [pending, setPending] = useState<PendingQueue | null>(null);
  const subtitles = useDownloadSubtitles();
  const embedMeta = useSettings((s) => s.settings?.downloadEmbedMeta ?? true);
  const updateSettings = useSettings((s) => s.update);

  const probe = useJobRunner<ProbeResult>("download.probe", {
    onResult: (result) => form.set(probedForm(result, useDownloadForm.getState().restore)),
    onError: (error) => {
      form.set({ restore: null });
      notify.error(t("download.toast.probeError"), { body: error });
    },
  });

  const download = useJobRunner<{ title: string; path: string; size: number; outdir: string }>("download", {
    onError: (error) => notify.error(t("download.toast.error"), { body: error }),
  });

  const batch = useJobRunner<BatchResult>("download.batch", {
    onError: (error) => notify.error(t("download.toast.error"), { body: error }),
  });

  const urls = useMemo(() => form.batchText.split(/\r?\n/).map((u) => u.trim()).filter(Boolean), [form.batchText]);

  const serverOrder = queueOrder(batch.job);
  // A dragged order shows at once and gives way to the next order the queue reports.
  const [dragged, setDragged] = useState<{ order: number[]; base: number[] | undefined } | null>(null);
  const order = dragged && dragged.base === serverOrder ? dragged.order : serverOrder;

  // Batch queue view: merge streamed per-item partials with the progress of the running items.
  const queue = useMemo<BatchItem[]>(() => {
    const items = new Map<number, BatchItem>();
    const source = (batch.job?.partials && batch.job.partials.length > 0 ? (batch.job.partials as BatchItem[]) : lastBatch) ?? [];
    if (!batch.job && !lastBatch) {
      urls.forEach((url, index) => items.set(index, { index, url, status: "pending", percent: 0 }));
      return Array.from(items.values());
    }
    source.forEach((p) => items.set(p.index, { ...items.get(p.index), ...p }));
    runningItems(batch.job).forEach((run, index) => {
      const cur = items.get(index);
      if (cur) items.set(index, { ...cur, status: "running", percent: run.percent });
    });
    const list = Array.from(items.values());
    if (!order) return list;
    const position = new Map(order.map((index, at) => [index, at]));
    return list.sort((a, b) => (position.get(a.index) ?? Infinity) - (position.get(b.index) ?? Infinity) || a.index - b.index);
  }, [batch.job, lastBatch, urls, order]);

  const failedItems = useMemo(() => queue.filter((i) => i.status === "error"), [queue]);
  const batchResult = batch.job?.result as Partial<BatchResult> | undefined;

  // Copied when the queue ends, also if it ended while another page was open: the job itself is pruned later.
  const endedItems =
    batch.job && batch.job.status !== "running" ? (batchResult?.items ?? (batch.job.partials as BatchItem[])) : undefined;
  useEffect(() => {
    if (endedItems?.length) useDownloadForm.getState().set({ lastBatch: endedItems });
  }, [endedItems]);

  useEffect(() => {
    if (batch.running) return;
    let current = true;
    api.download
      .pendingQueue()
      .then((saved) => current && setPending(saved))
      .catch(() => current && setPending(null));
    return () => {
      current = false;
    };
  }, [batch.running]);

  /** Starts a queue; an unfinished one from before is replaced only after the user agrees. */
  const runBatch = async (batchUrls: string[]) => {
    if (
      pending &&
      !(await confirm({
        title: t("download.pending.replaceTitle"),
        body: t("download.pending.replaceBody", { count: pending.urls.length }),
        confirmLabel: t("download.pending.replace"),
      }))
    )
      return null;
    setPending(null);
    setLastBatch(null);
    return batch.start(() =>
      api.download.batch({
        urls: batchUrls,
        outdir,
        template: form.template,
        subtitles: subtitles.params,
        mode: form.batchMode,
        audioCodec: form.audioCodec,
        maxHeight: form.maxHeight,
        sponsorblock: form.sponsorblock,
      }),
    );
  };

  /** The queue's own options are used: the running queue takes the links again, a finished one starts a new queue. */
  const retryFailed = () => {
    const jobId = batch.jobId;
    if (!jobId) return;
    batch
      .start(async () => {
        const id = await retryFailedLinks(jobId);
        if (id !== jobId) setLastBatch(null);
        return id;
      })
      .catch((err) => notify.error(errorMessage(t, err)));
  };

  const queueJobId = batch.job?.status === "running" ? batch.job.id : null;

  const reorderQueue = (next: number[]) => {
    if (!queueJobId) return;
    setDragged({ order: next, base: serverOrder });
    api.download.reorderBatch({ jobId: queueJobId, order: next }).catch((err) => notify.error(errorMessage(t, err)));
  };

  const skipItem = (index: number) => {
    if (!queueJobId) return;
    api.download.skipBatchItem({ jobId: queueJobId, index }).catch((err) => notify.error(errorMessage(t, err)));
  };

  const resumeQueue = () => {
    setLastBatch(null);
    setPending(null);
    form.set({ tab: "batch" });
    batch.start(() => api.download.resumeQueue()).catch((err) => notify.error(errorMessage(t, err)));
  };

  const discardQueue = () =>
    api.download
      .discardQueue()
      .then(() => setPending(null))
      .catch((err) => notify.error(errorMessage(t, err)));

  const activeJob = form.tab === "batch" ? batch.job : download.running ? download.job : probe.running ? probe.job : download.job;
  const running = probe.running || download.running || batch.running;
  const extra = activeJob?.status === "running" ? activeJob.extra : {};
  const speed = typeof extra.speed === "number" ? extra.speed : undefined;
  const eta = typeof extra.eta === "number" ? extra.eta : undefined;
  const sizes =
    typeof extra.downloaded === "number" && typeof extra.total === "number" && extra.total > 0
      ? `${formatBytes(extra.downloaded)} / ${formatBytes(extra.total)}`
      : undefined;
  const detail =
    speed != null
      ? [sizes, `${formatBytes(speed)}/s`, eta != null && t("common.eta", { time: formatDuration(eta) })].filter(Boolean).join(" · ")
      : undefined;

  const runProbe = () => {
    if (!form.url.trim()) return;
    form.set({ probe: null, formatId: "" });
    download.reset();
    probe.start(() => api.download.probe(form.url.trim())).catch((err) => notify.error(errorMessage(t, err)));
  };

  useEffect(() => {
    if (!useDownloadForm.getState().autoProbe) return; // fresh state: a repeated effect must not probe twice
    form.set({ autoProbe: false });
    runProbe();
  }, [form.autoProbe]); // eslint-disable-line react-hooks/exhaustive-deps -- probes once per auto-probe request, not on every new runProbe

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) form.set({ url: text.trim() });
    } catch {
      /* clipboard not permitted */
    }
  };

  const startBatch = (batchUrls: string[]) =>
    runBatch(batchUrls)
      .then((jobId) => jobId && form.set({ batchText: "" }))
      .catch((err) => notify.error(errorMessage(t, err)));

  const playlistEntries = form.probe?.isPlaylist ? (form.probe.entries ?? []) : [];
  const selectedUrls = playlistEntries.filter((_, i) => form.selectedEntries.includes(i)).map((e) => e.url);

  const startDownload = () => {
    if (form.tab === "batch") {
      if (batch.running && batch.jobId) {
        api.download
          .addToBatch({ jobId: batch.jobId, urls })
          .then(({ success }) => {
            if (!success) {
              startBatch(urls);
              return;
            }
            form.set({ batchText: "" });
            notify.success(t("download.toast.addedToBatch", { count: urls.length }));
          })
          .catch((err) => notify.error(errorMessage(t, err)));
        return;
      }
      startBatch(urls);
      return;
    }
    if (!form.probe) return;
    if (playlistEntries.length > 0) {
      if (selectedUrls.length === 0) return;
      form.set({ tab: "batch" });
      runBatch(selectedUrls).catch((err) => notify.error(errorMessage(t, err)));
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
          subtitles: subtitles.params,
          sponsorblock: form.sponsorblock,
          section: clipSection(form.clip, form.clipStart, form.clipEnd, form.probe!.duration),
        }),
      )
      .catch((err) => notify.error(errorMessage(t, err)));
  };

  const canDownload =
    form.tab === "batch"
      ? urls.length > 0 && !!outdir
      : !running && !!outdir && !!form.probe && (form.probe.isPlaylist ? selectedUrls.length > 0 : !!form.formatId);
  const showBatchFormat = form.tab === "batch" || !!form.probe?.isPlaylist;

  const canClear =
    !running && !!(form.url || form.probe || form.batchText || lastBatch || download.job || batch.job || probe.job);

  const clearAll = () => {
    form.set({
      url: "",
      probe: null,
      formatId: "",
      selectedEntries: [],
      clip: false,
      clipStart: "",
      clipEnd: "",
      batchText: "",
      lastBatch: null,
    });
    probe.reset();
    download.reset();
    batch.reset();
  };

  useToolShortcuts({ run: canDownload && startDownload });

  const outputPanel = (
    <Panel title={t("download.output")}>
      <OutputFolderField value={form.outdir} onChange={(dir) => form.set({ outdir: dir })} />
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
      {showBatchFormat && <BatchFormatField />}
      <Switch
        checked={embedMeta}
        label={t("download.embedMeta")}
        onChange={(_, d) => updateSettings({ downloadEmbedMeta: d.checked }).catch(() => undefined)}
      />
      <Switch
        checked={form.sponsorblock}
        label={
          <InfoLabel info={t("download.sponsorblockHint")}>{t("download.sponsorblock")}</InfoLabel>
        }
        onChange={(_, d) => form.set({ sponsorblock: d.checked })}
      />
      {form.tab === "single" && form.probe && !form.probe.isPlaylist && !!form.probe.duration && <ClipField probe={form.probe} />}
      <SubtitlesField subtitles={subtitles} />
    </Panel>
  );

  return (
    <ToolPage toolId="download">
      <Columns side={outputPanel}>
        <TabList selectedValue={form.tab} onTabSelect={(_, d) => form.set({ tab: d.value as "single" | "batch" })}>
          <Tab value="single" icon={<Link24Regular />}>
            {t("download.single")}
          </Tab>
          <Tab value="batch" icon={<TextBulletListLtr24Regular />}>
            {t("download.batch")}
          </Tab>
        </TabList>

        {pending && !batch.running && (
          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>
              <MessageBarTitle>{t("download.pending.title", { count: pending.urls.length })}</MessageBarTitle>
              {pending.options.outdir}
            </MessageBarBody>
            <MessageBarActions>
              <Button size="small" appearance="primary" icon={<Play16Regular />} onClick={resumeQueue}>
                {t("download.pending.resume")}
              </Button>
              <Button size="small" icon={<Dismiss16Regular />} onClick={discardQueue}>
                {t("download.pending.discard")}
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

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

            {download.result && (
              <ResultCard
                title={t("download.toast.done")}
                detail={[download.result.title, download.result.size ? formatBytes(download.result.size) : ""].filter(Boolean).join(" · ")}
                path={download.result.path}
                sourceToolId="download"
              />
            )}
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
          <>
            {batch.result && !batch.running && (
              <ResultCard
                title={
                  batch.result.skipped
                    ? t("download.toast.batchDoneSkipped", { ok: batch.result.succeeded, count: batch.result.failed, skipped: batch.result.skipped })
                    : t("download.toast.batchDone", { ok: batch.result.succeeded, count: batch.result.failed })
                }
                path={batch.result.outdir}
                folder
                sourceToolId="download"
              />
            )}
            <BatchQueue
              queue={queue}
              running={batch.running}
              totalSize={batchTotal(batchResult?.totalSize, queue, "size")}
              totalDuration={batchTotal(batchResult?.totalDuration, queue, "duration")}
              onReorder={queueJobId ? reorderQueue : undefined}
              onSkip={queueJobId ? skipItem : undefined}
            />
          </>
        )}

        {activeJob && activeJob.logs.length > 0 && <LogPanel logs={activeJob.logs} />}
      </Columns>

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
        {form.tab === "batch" && failedItems.length > 0 && !!batch.jobId && !probe.running && !download.running && (
          <Button icon={<ArrowClockwise16Regular />} onClick={retryFailed}>
            {t("download.retryFailed", { count: failedItems.length })}
          </Button>
        )}
        {canClear && (
          <Button icon={<Dismiss16Regular />} onClick={clearAll}>
            {t("common.clear")}
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
              ? selectedUrls.length < playlistEntries.length
                ? t("download.downloadSelected", { count: selectedUrls.length, total: playlistEntries.length })
                : t("download.downloadPlaylist", { count: playlistEntries.length })
              : t("download.download")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

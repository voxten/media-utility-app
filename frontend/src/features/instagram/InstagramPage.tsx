import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Input, makeStyles, mergeClasses, Spinner, tokens, Tooltip } from "@fluentui/react-components";
import {
  ArrowDownload16Filled,
  Camera24Regular,
  ClipboardPaste16Regular,
  Image24Regular,
  ImageMultiple16Filled,
  Link24Regular,
  Search16Regular,
  Stop16Regular,
  Video16Filled,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { AfterGallery, type AfterGalleryItem } from "../../components/AfterGallery";
import { EmptyState } from "../../components/EmptyState";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { formatBytes, formatDuration } from "../../lib/format";
import type { InstagramItem, InstagramListing, InstagramResult } from "../../lib/types";
import { useJobRunner } from "../../lib/useJobRunner";
import { useInstagramForm } from "./store";
import { errorMessage } from "../../lib/errors";
import { useToolShortcuts } from "../../lib/useToolShortcuts";

// Above this many saved files the result shows the folder instead of a thumbnail per file.
const GALLERY_LIMIT = 40;

const useStyles = makeStyles({
  urlRow: { display: "flex", gap: "8px", width: "100%", minWidth: 0 },
  urlInput: { flexGrow: 1, minWidth: 0 },
  searchBtn: { flexShrink: 0, whiteSpace: "nowrap" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
  },
  tile: {
    position: "relative",
    aspectRatio: "4 / 5",
    padding: 0,
    borderRadius: tokens.borderRadiusMedium,
    border: `2px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: tokens.colorNeutralForeground4,
    ":hover": { border: `2px solid ${tokens.colorNeutralStroke1Hover}` },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "2px" },
  },
  tileSelected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    ":hover": { border: `2px solid ${tokens.colorBrandStroke1}` },
  },
  tileUnselected: { "& img": { opacity: 0.45 } },
  thumb: { width: "100%", height: "100%", objectFit: "cover" },
  check: {
    position: "absolute",
    top: "4px",
    left: "4px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  badge: {
    position: "absolute",
    right: "6px",
    bottom: "6px",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 6px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackgroundInverted,
    color: tokens.colorNeutralForegroundInverted,
    fontSize: tokens.fontSizeBase200,
  },
});

export default function InstagramPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const form = useInstagramForm();
  const outdir = useOutputDir(form.outdir);
  const { post, selected } = form;

  const probe = useJobRunner<InstagramListing>("instagram.probe", {
    onResult: (result) => form.set({ post: result, selected: result.items.filter((it) => it.selected).map((it) => it.index) }),
    onError: (error) => notify.error(t("instagram.toast.probeError"), { body: error }),
  });

  const download = useJobRunner<InstagramResult>("instagram", {
    onResult: (result) => form.set({ result }),
    onDone: (result) => {
      if (!result.files.length) notify.warning(t("instagram.toast.failed", { count: result.failed }));
    },
    onError: (error) => notify.error(t("instagram.toast.error"), { body: error }),
  });

  const running = probe.running || download.running;
  const activeJob = download.running ? download.job : probe.running ? probe.job : (download.job ?? probe.job);

  const [stoppedJob, setStoppedJob] = useState<string | null>(null);
  const stopListing = () => {
    if (!probe.jobId) return;
    setStoppedJob(probe.jobId);
    api.instagram.stop(probe.jobId).catch((err) => notify.error(errorMessage(t, err)));
  };

  const runProbe = () => {
    const url = form.url.trim();
    if (!url || probe.running) return;
    form.set({ post: null, selected: [], result: null });
    probe.start(() => api.instagram.probe(url)).catch((err) => notify.error(errorMessage(t, err)));
  };

  useEffect(() => {
    if (!useInstagramForm.getState().autoProbe) return; // fresh state: a repeated effect must not probe twice
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

  const toggle = (index: number) =>
    form.set({ selected: selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index] });

  const allSelected = !!post && selected.length === post.items.length;
  // A profile streams its posts page by page while it is being checked.
  const items: InstagramItem[] = post?.items ?? (probe.running ? ((probe.job?.partials ?? []) as InstagramItem[]) : []);
  const fileCount = post ? post.items.reduce((sum, it) => sum + (selected.includes(it.index) ? it.count : 0), 0) : 0;
  const title = post?.uploader ? `@${post.uploader}` : "Instagram";

  const startDownload = () => {
    if (!post || selected.length === 0) return;
    download
      .start(() => {
        const keys = post.items.filter((it) => selected.includes(it.index)).map((it) => it.key);
        return api.instagram.start({ url: post.url, outdir, keys, title });
      })
      .catch((err) => notify.error(errorMessage(t, err)));
  };

  const canDownload = !running && !!post && selected.length > 0 && !!outdir;
  useToolShortcuts({ run: canDownload && startDownload });

  const resultDetail = form.result
    ? [formatBytes(form.result.size), form.result.failed > 0 && t("instagram.toast.failed", { count: form.result.failed })].filter(Boolean).join(" · ")
    : "";

  const tileLabel = (item: InstagramItem) => {
    const key = { image: "instagram.photoN", video: "instagram.videoN", carousel: "instagram.carouselN" }[item.kind];
    return t(key, { n: item.index + 1 });
  };

  const savedItems = useMemo<AfterGalleryItem[]>(() => {
    if (!form.result) return [];
    const thumbnails = new Map(post?.items.map((it) => [it.key, it.thumbnail]));
    const keys = form.result.keys;
    return form.result.files.map((file, i) => ({ file, dataUrl: thumbnails.get(keys[i]) ?? undefined }));
  }, [form.result, post]);

  return (
    <ToolPage toolId="instagram">
      <Panel>
        <div className={styles.urlRow}>
          <Input
            className={styles.urlInput}
            size="large"
            value={form.url}
            placeholder={t("instagram.urlPlaceholder")}
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

      {items.length > 0 ? (
        <Panel
          title={post?.kind === "stories" ? t("instagram.storiesOf", { user: post.uploader }) : title}
          actions={
            post && (
              <Button
                appearance="subtle"
                onClick={() => form.set({ selected: allSelected ? [] : post.items.map((it) => it.index) })}
              >
                {allSelected ? t("instagram.selectNone") : t("instagram.selectAll")}
              </Button>
            )
          }
        >
          <div className={styles.grid}>
            {items.map((item) => {
              const isSelected = selected.includes(item.index);
              const label = tileLabel(item);
              return (
                <button
                  key={item.index}
                  type="button"
                  disabled={!post}
                  aria-pressed={isSelected}
                  aria-label={label}
                  title={item.width && item.height ? `${label} · ${item.width}×${item.height}` : label}
                  className={mergeClasses(styles.tile, post ? (isSelected ? styles.tileSelected : styles.tileUnselected) : undefined)}
                  onClick={() => toggle(item.index)}
                >
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className={styles.thumb} loading="lazy" draggable={false} />
                  ) : (
                    <Image24Regular />
                  )}
                  {post && <Checkbox className={styles.check} checked={isSelected} tabIndex={-1} aria-hidden />}
                  {item.kind === "video" && (
                    <span className={styles.badge}>
                      <Video16Filled />
                      {item.duration ? formatDuration(item.duration) : null}
                    </span>
                  )}
                  {item.kind === "carousel" && (
                    <span className={styles.badge}>
                      <ImageMultiple16Filled />
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>
      ) : (
        !probe.running && (
          <Panel>
            <EmptyState icon={Camera24Regular} title={t("instagram.emptyTitle")}>
              {t("instagram.emptyBody")}
            </EmptyState>
          </Panel>
        )
      )}

      <Panel title={t("download.output")}>
        <OutputFolderField value={form.outdir} onChange={(dir) => form.set({ outdir: dir })} />
      </Panel>

      {form.result && form.result.files.length > GALLERY_LIMIT && (
        <ResultCard
          title={t("instagram.toast.done", { count: form.result.files.length })}
          path={form.result.outdir}
          folder
          sourceToolId="instagram"
          detail={resultDetail}
        />
      )}

      {savedItems.length > 0 && form.result && form.result.files.length <= GALLERY_LIMIT && (
        <AfterGallery
          title={t("instagram.saved")}
          items={savedItems}
          outputDir={form.result.outdir}
          sourceToolId="instagram"
          summary={resultDetail}
        />
      )}

      <ActionBar
        job={activeJob?.status === "running" || activeJob?.status === "error" ? activeJob : undefined}
        idleText={post ? t("instagram.idle.ready") : t("instagram.idle.empty")}
        onCancel={() => (download.running ? download.cancel() : probe.cancel())}
      >
        {probe.running && items.length > 0 && (
          <Tooltip content={t("instagram.stopHint")} relationship="description">
            <Button icon={<Stop16Regular />} disabled={stoppedJob === probe.jobId} onClick={stopListing}>
              {t("instagram.stop")}
            </Button>
          </Tooltip>
        )}
        <Button
          appearance="primary"
          icon={<ArrowDownload16Filled />}
          disabled={!canDownload}
          onClick={startDownload}
        >
          {fileCount > 0 ? t("instagram.downloadCount", { count: fileCount }) : t("download.download")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

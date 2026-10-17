import { useEffect, useState } from "react";
import {
  Button,
  Caption1,
  Dropdown,
  Field,
  Input,
  makeStyles,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { Add16Regular, ArrowMinimize24Regular, ArrowRight16Regular, Delete16Regular, Image24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { AfterGallery } from "../../components/AfterGallery";
import { DropZone } from "../../components/DropZone";
import { FileStrip } from "../../components/FileStrip";
import { ImageComparison } from "../../components/ImageComparison";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { claimDrop, matchesExtensions } from "../../lib/drop";
import { dialogFilter, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useTransferStore } from "../../stores/transfer";

type Mode = "smart" | "lossless" | "target";
type Format = "original" | "webp" | "jpeg" | "png";

interface PreviewData {
  path: string;
  fileName: string;
  size: number;
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  dataUrl: string;
}

interface CompressedPreview {
  compressedBytes: number;
  savedBytes: number;
  savedPercent: number;
  dataUrl: string;
}

interface CompressResult {
  total: number;
  processed: number;
  failed: number;
  inBytes: number;
  outBytes: number;
  savedBytes: number;
  savedPercent: number;
  outputDir: string;
  outPath?: string;
  files?: string[];
  results: { file: string; dest: string; inBytes: number; outBytes: number; savedPercent: number }[];
}

const TARGET_PRESETS_KB = [200, 500, 1000, 2000];
const PREVIEW_DELAY_MS = 200;

const useStyles = makeStyles({
  settings: { display: "flex", flexWrap: "wrap", gap: "16px 24px", alignItems: "flex-end" },
  format: { minWidth: "240px" },
  param: { flex: "1 1 280px", minWidth: 0 },
  targetRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  targetInput: { width: "130px" },
  stage: {
    height: "min(60vh, 560px)",
    minHeight: "320px",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
  },
  meta: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  saved: { color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold },
});

export default function CompressorPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("compressor")!;

  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [compressed, setCompressed] = useState<CompressedPreview | null>(null);
  const [updating, setUpdating] = useState(false);

  const [mode, setMode] = useState<Mode>("smart");
  const [format, setFormat] = useState<Format>("original");
  const [quality, setQuality] = useState(80);
  const [targetKb, setTargetKb] = useState("500");

  const job = useJobRunner<CompressResult>("compressor", {
    onDone: (res) => {
      if (res.failed > 0) notify.warning(t("common.errorsCount", { count: res.failed }));
    },
    onError: (err) => notify.error(t("compressor.toast.error"), { body: err }),
  });

  const current = files[selected] ?? null;
  const params = { format, mode, quality, targetKb: mode === "target" ? Number(targetKb) || 500 : undefined };

  const addFiles = (paths: string[]) => {
    const accepted = paths.filter((p) => matchesExtensions(p, IMAGE_EXTENSIONS));
    if (!accepted.length) return;
    job.reset();
    setFiles((prev) => Array.from(new Set([...prev, ...accepted])));
  };

  const browse = async () => addFiles(await api.dialogs.openFiles([dialogFilter(t, "images")]));

  const removeAt = (index: number) => {
    job.reset();
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setSelected((s) => Math.max(0, s > index ? s - 1 : Math.min(s, files.length - 2)));
  };

  const clear = () => {
    job.reset();
    setFiles([]);
    setSelected(0);
  };

  useIncomingTransfer("compressor", addFiles);

  useEffect(() => {
    setPreview(null);
    setCompressed(null);
    if (!current) return;
    let live = true;
    api.compressor
      .loadPreview(current)
      .then((p) => live && setPreview(p))
      .catch((err) => notify.error(String(err)));
    return () => {
      live = false;
    };
  }, [current, notify]);

  useEffect(() => {
    if (!preview) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      setUpdating(true);
      try {
        const res = await api.compressor.preview(preview.path, params);
        if (live) setCompressed(res);
      } catch (err) {
        console.warn("Compressor preview failed:", err);
      } finally {
        if (live) setUpdating(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // `params` is rebuilt every render from the values listed here.
  }, [preview, format, mode, quality, targetKb]);

  const start = async () => {
    if (files.length === 1) {
      const ext = format === "original" ? fileName(files[0]).split(".").pop() || "png" : format;
      const outPath = await api.dialogs.saveFile(`${fileName(files[0]).replace(/\.[^.]+$/, "")}_compressed.${ext}`, [
        dialogFilter(t, "images", [`.${ext}`]),
      ]);
      if (outPath) job.start(() => api.compressor.start({ path: files[0], outPath, ...params }));
      return;
    }
    const outputDir = await api.dialogs.openFolder();
    if (outputDir) job.start(() => api.compressor.start({ files, outputDir, ...params }));
  };

  const result = job.result;

  if (!files.length) {
    return (
      <Page title={t("tools.compressor.name")} description={t("tools.compressor.description")} icon={tool.icon} accent={tool.accent}>
        <DropZone
          icon={Image24Regular}
          title={t("compressor.dropTitle")}
          hint={t("compressor.dropHint")}
          accept={IMAGE_EXTENSIONS}
          onFiles={addFiles}
          onBrowse={browse}
        />
      </Page>
    );
  }

  const formatLabel: Record<Format, string> = {
    original: t("compressor.formatOriginal"),
    webp: t("compressor.formatWebp"),
    jpeg: t("compressor.formatJpeg"),
    png: t("compressor.formatPng"),
  };

  return (
    <Page title={t("tools.compressor.name")} description={t("tools.compressor.description")} icon={tool.icon} accent={tool.accent}>
      <Panel>
        <div className={styles.settings}>
          <Field label={t("compressor.mode")}>
            <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as Mode)}>
              <Radio value="smart" label={t("compressor.modeSmart")} />
              <Radio value="lossless" label={t("compressor.modeLossless")} />
              <Radio value="target" label={t("compressor.modeTarget")} />
            </RadioGroup>
          </Field>
        </div>
        <div className={styles.settings}>
          <Field label={t("compressor.format")} className={styles.format}>
            <Dropdown value={formatLabel[format]} selectedOptions={[format]} onOptionSelect={(_, d) => setFormat(d.optionValue as Format)}>
              {(Object.keys(formatLabel) as Format[]).map((f) => (
                <Option key={f} value={f}>
                  {formatLabel[f]}
                </Option>
              ))}
            </Dropdown>
          </Field>
          {mode === "smart" && (
            <div className={styles.param}>
              <SliderField label={t("compressor.quality")} value={quality} min={20} max={100} format={(v) => `${v}%`} onChange={setQuality} />
            </div>
          )}
          {mode === "target" && (
            <Field label={t("compressor.targetKb")} className={styles.param}>
              <div className={styles.targetRow}>
                <Input className={styles.targetInput} type="number" value={targetKb} contentAfter="KB" onChange={(_, d) => setTargetKb(d.value)} />
                {TARGET_PRESETS_KB.map((kb) => (
                  <Button key={kb} size="small" appearance="subtle" onClick={() => setTargetKb(String(kb))}>
                    {kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`}
                  </Button>
                ))}
              </div>
            </Field>
          )}
        </div>
      </Panel>

      <Panel
        title={current ? fileName(current) : undefined}
        actions={
          <>
            <Button appearance="subtle" icon={<Add16Regular />} onClick={browse}>
              {t("common.addFiles")}
            </Button>
            {!result && (
              <Button appearance="subtle" icon={<ArrowRight16Regular />} onClick={() => useTransferStore.getState().openModal(files, "compressor")}>
                {t("transfer.sendTo")}
              </Button>
            )}
            <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => removeAt(selected)}>
              {t("common.remove")}
            </Button>
          </>
        }
      >
        <div
          className={styles.stage}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            claimDrop(e, addFiles);
          }}
        >
          {preview && compressed?.dataUrl ? (
            <ImageComparison
              maxHeight="100%"
              before={preview.dataUrl}
              after={compressed.dataUrl}
              beforeLabel={t("compressor.before")}
              afterLabel={t("compressor.after")}
            />
          ) : (
            <Spinner label={t("common.loading")} />
          )}
        </div>

        {preview && (
          <div className={styles.meta}>
            <Caption1>
              {preview.width} × {preview.height} px · {preview.format.toUpperCase()}
            </Caption1>
            {compressed && (
              <Text>
                {formatBytes(preview.size)} → <span className={styles.saved}>{formatBytes(compressed.compressedBytes)}</span> (−{compressed.savedPercent}%)
              </Text>
            )}
            {updating && <Spinner size="extra-tiny" />}
          </div>
        )}

        {files.length > 1 && (
          <FileStrip
            files={files}
            selected={selected}
            onSelect={setSelected}
            onRemove={removeAt}
            actions={
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={clear}>
                {t("common.clearAll")}
              </Button>
            }
          />
        )}

        {result?.outPath && <ResultCard title={t("compressor.toast.success")} path={result.outPath} sourceToolId="compressor" />}
      </Panel>

      {result && !result.outPath && result.results.length > 0 && (
        <AfterGallery
          title={t("transfer.compressedTitle")}
          summary={t("compressor.summary", {
            processed: result.processed,
            total: result.total,
            saved: formatBytes(result.savedBytes),
            percent: result.savedPercent,
          })}
          files={result.files || result.results.map((r) => r.dest)}
          items={result.results.map((r) => ({
            file: r.file,
            dest: r.dest,
            name: fileName(r.dest),
            originalSize: r.inBytes,
            size: r.outBytes,
            savedPercent: r.savedPercent,
          }))}
          outputDir={result.outputDir}
          sourceToolId="compressor"
        />
      )}

      <ActionBar job={job.job?.status === "done" ? undefined : job.job} onCancel={job.cancel}>
        <Button appearance="primary" icon={<ArrowMinimize24Regular />} disabled={job.running || !compressed} onClick={start}>
          {files.length > 1 ? t("compressor.compressAll", { count: files.length }) : t("compressor.compressAction")}
        </Button>
      </ActionBar>
    </Page>
  );
}

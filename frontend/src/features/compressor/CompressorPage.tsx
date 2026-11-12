import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Caption1,
  Field,
  Input,
  makeStyles,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { Add16Regular, ArrowMinimize24Regular, ArrowRight16Regular, Delete16Regular, Image24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { AfterGallery } from "../../components/AfterGallery";
import { DropZone } from "../../components/DropZone";
import { FileStrip } from "../../components/FileStrip";
import { ImageComparison } from "../../components/ImageComparison";
import { useNotify } from "../../components/notify";
import { Columns } from "../../components/Columns";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { checkerboard } from "../../lib/checkerboard";
import { claimDrop, DROP_ZONE_ATTR, matchesExtensions } from "../../lib/drop";
import { dialogFilter, formatList, formatName, IMAGE_EXTENSIONS, imageFormatLabel, type ImageOutputFormat } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { IMAGE_STAGE_HEIGHT } from "../../lib/imageStage";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useTransferStore } from "../../stores/transfer";
import { errorMessage } from "../../lib/errors";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { addUnique, removeFileAt } from "../../lib/fileList";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { useCompressorForm, type CompressMode } from "./store";
const FORMATS: ImageOutputFormat[] = ["original", "webp", "jpeg", "png"];

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
  results: { file: string; dest: string; inBytes: number; outBytes: number; savedPercent: number; noGain?: boolean }[];
}

const TARGET_PRESETS_KB = [200, 500, 1000, 2000];
const PREVIEW_DELAY_MS = 200;

const useStyles = makeStyles({
  targetRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  targetInput: { width: "130px" },
  stage: {
    height: IMAGE_STAGE_HEIGHT,
    minHeight: "320px",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusLarge,
    ...checkerboard(),
    overflow: "hidden",
  },
  meta: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  saved: { color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold },
});

export default function CompressorPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const form = useCompressorForm();
  const { files, selected, mode, format, quality, targetKb } = form;
  const outputDir = useOutputDir(form.outputDir);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [compressed, setCompressed] = useState<CompressedPreview | null>(null);
  const [updating, setUpdating] = useState(false);

  const job = useJobRunner<CompressResult>("compressor", {
    onDone: (res) => {
      if (!res.processed) notify.warning(t("common.errorsCount", { count: res.failed }));
    },
    onError: (err) => notify.error(t("compressor.toast.error"), { body: err }),
  });

  const current = files[selected] ?? null;
  const params = useMemo(
    () => ({ format, mode, quality, targetKb: mode === "target" ? Number(targetKb) || 500 : undefined }),
    [format, mode, quality, targetKb],
  );

  const addFiles = (paths: string[]) => {
    const accepted = paths.filter((p) => matchesExtensions(p, IMAGE_EXTENSIONS));
    if (!accepted.length) return;
    job.reset();
    form.set({ files: addUnique(useCompressorForm.getState().files, accepted) });
  };

  const browse = async () => addFiles(await api.dialogs.openFiles([dialogFilter(t, "images")]));

  const removeAt = (index: number) => {
    job.reset();
    form.set(removeFileAt(files, selected, index));
  };

  const clear = () => {
    job.reset();
    form.set({ files: [], selected: 0 });
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
      .catch((err) => notify.error(errorMessage(t, err)));
    return () => {
      live = false;
    };
  }, [current, notify, t]);

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
  }, [preview, params]);

  const canStart = !job.running && !!compressed && !!outputDir;
  const start = () =>
    job.start(() => api.compressor.start({ files, outputDir, ...params })).catch((err) => notify.error(t("compressor.toast.error"), { body: errorMessage(t, err) }));

  useToolShortcuts({ run: canStart && start, open: browse });

  const result = job.result;

  if (!files.length) {
    return (
      <ToolPage toolId="compressor">
        <DropZone
          fill
          icon={Image24Regular}
          title={t("compressor.dropTitle")}
          hint={t("compressor.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
          accept={IMAGE_EXTENSIONS}
          onFiles={addFiles}
          onBrowse={browse}
        />
      </ToolPage>
    );
  }


  const options = (
    <Panel>
      <Field label={t("compressor.mode")}>
        <RadioGroup value={mode} onChange={(_, d) => form.set({ mode: d.value as CompressMode })}>
          <Radio value="smart" label={t("compressor.modeSmart")} />
          <Radio value="lossless" label={t("compressor.modeLossless")} />
          <Radio value="target" label={t("compressor.modeTarget")} />
        </RadioGroup>
      </Field>
      <Field label={t("common.outputFormat")}>
        <Select searchable options={FORMATS.map((f) => ({ value: f, label: imageFormatLabel(t, f) }))} value={format} onChange={(next) => form.set({ format: next })} />
      </Field>
      {mode === "smart" && (
        <SliderField label={t("compressor.quality")} value={quality} min={20} max={100} format={(v) => `${v}%`} onChange={(next) => form.set({ quality: next })} />
      )}
      {mode === "target" && (
        <Field label={t("compressor.targetKb")}>
          <div className={styles.targetRow}>
            <Input className={styles.targetInput} type="number" value={targetKb} contentAfter="KB" onChange={(_, d) => form.set({ targetKb: d.value })} />
            {TARGET_PRESETS_KB.map((kb) => (
              <Button key={kb} size="small" appearance="subtle" onClick={() => form.set({ targetKb: String(kb) })}>
                {kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`}
              </Button>
            ))}
          </div>
        </Field>
      )}
      <OutputFolderField value={form.outputDir} onChange={(dir) => form.set({ outputDir: dir })} />
    </Panel>
  );

  return (
    <ToolPage toolId="compressor">
      <Columns side={options}>
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
            {...{ [DROP_ZONE_ATTR]: "" }}
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
                {preview.width} × {preview.height} px · {formatName(preview.format)}
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
              onSelect={(index) => form.set({ selected: index })}
              onRemove={removeAt}
              actions={
                <Button appearance="subtle" icon={<Delete16Regular />} onClick={clear}>
                  {t("common.clearAll")}
                </Button>
              }
            />
          )}

          {result?.outPath && (
            <ResultCard
              title={t("compressor.toast.success")}
              detail={result.results[0]?.noGain ? t("compressor.noGain") : undefined}
              path={result.outPath}
              sourceToolId="compressor"
            />
          )}
        </Panel>

        {result && !result.outPath && result.results.length > 0 && (
          <AfterGallery
            title={t("transfer.compressedTitle")}
            summary={[
              t("compressor.summary", {
                processed: result.processed,
                total: result.total,
                saved: formatBytes(result.savedBytes),
                percent: result.savedPercent,
              }),
              result.failed > 0 && t("common.errorsCount", { count: result.failed }),
            ]
              .filter(Boolean)
              .join(" · ")}
            files={result.files || result.results.map((r) => r.dest)}
            items={result.results.map((r) => ({
              file: r.file,
              dest: r.dest,
              name: fileName(r.dest),
              originalSize: r.inBytes,
              size: r.outBytes,
              savedPercent: r.savedPercent,
              note: r.noGain ? t("compressor.noGain") : undefined,
            }))}
            outputDir={result.outputDir}
            sourceToolId="compressor"
          />
        )}
      </Columns>

      <ActionBar job={job.job?.status === "done" ? undefined : job.job} onCancel={job.cancel}>
        <Button appearance="primary" icon={<ArrowMinimize24Regular />} disabled={!canStart} onClick={start}>
          {files.length > 1 ? t("compressor.compressAll", { count: files.length }) : t("compressor.compressAction")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

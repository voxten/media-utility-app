import { useEffect, useMemo, useState } from "react";
import { Button, Caption1, Dropdown, makeStyles, Option, Spinner, tokens } from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowRight16Regular,
  Copy16Regular,
  CopySelect20Regular,
  Delete16Regular,
  Image24Regular,
  Save16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { AfterGallery } from "../../components/AfterGallery";
import { DropZone } from "../../components/DropZone";
import { FileStrip } from "../../components/FileStrip";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { allFilesFilter, dialogFilter, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useTransferStore } from "../../stores/transfer";
import { ImageCanvasStage } from "./ImageCanvasStage";
import { ImageToolbox } from "./ImageToolbox";
import type { CropRect } from "./InteractiveCropOverlay";
import { ToolOptionsBar } from "./ToolOptionsBar";
import {
  type ActiveTool,
  type BatchResult,
  type ImageOperations,
  type PreviewData,
  type TransformResult,
  createDefaultOperations,
} from "./types";

const PREVIEW_DELAY_MS = 150;
const OUTPUT_FORMATS = ["original", "png", "jpeg", "webp"] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const CROP_RATIOS: Record<string, number> = { "1_1": 1, "16_9": 16 / 9, "9_16": 9 / 16, "4_3": 4 / 3, "3_2": 3 / 2 };

const useStyles = makeStyles({
  stageRow: { display: "flex", gap: "12px", alignItems: "stretch", minHeight: "520px", height: "68vh" },
  viewer: { flexGrow: 1, minWidth: 0 },
  canvas: { flexGrow: 1, minHeight: 0, display: "flex", overflow: "hidden" },
  meta: { color: tokens.colorNeutralForeground3 },
  format: { minWidth: "160px" },
});

/** Converts editor state into the backend's operation dict for an image of the given natural size. */
function compileOps(ops: ImageOperations, width: number, height: number): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  if (ops.cropActive && ops.cropW > 0 && ops.cropH > 0 && (ops.cropW < width || ops.cropH < height || ops.cropX > 0 || ops.cropY > 0)) {
    res.crop = {
      x: Math.max(0, ops.cropX),
      y: Math.max(0, ops.cropY),
      width: Math.min(width - ops.cropX, ops.cropW),
      height: Math.min(height - ops.cropY, ops.cropH),
    };
  }
  if (ops.rotation !== 0) res.rotate = ops.rotation;
  if (ops.flipH) res.flip_h = true;
  if (ops.flipV) res.flip_v = true;
  if (ops.resizeActive) {
    if (ops.scalePercent != null && ops.scalePercent > 0 && ops.scalePercent !== 100) {
      res.resize = { percent: ops.scalePercent, filter: ops.filter || "lanczos" };
    } else if (ops.targetWidth && ops.targetHeight && (ops.targetWidth !== width || ops.targetHeight !== height)) {
      res.resize = { width: ops.targetWidth, height: ops.targetHeight, filter: ops.filter || "lanczos" };
    }
  }
  return res;
}

const isEdited = (ops: ImageOperations | undefined) =>
  !!ops && (ops.resizeActive || ops.cropActive || ops.rotation !== 0 || ops.flipH || ops.flipV);

const cropOf = (ops: ImageOperations, width: number, height: number): CropRect =>
  ops.cropActive ? { x: ops.cropX, y: ops.cropY, w: ops.cropW, h: ops.cropH } : { x: 0, y: 0, w: width, h: height };

export default function ImageToolsPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("image_tools")!;

  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [transformed, setTransformed] = useState<TransformResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const [opsByFile, setOpsByFile] = useState<Record<string, ImageOperations>>({});
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [activeTool, setActiveTool] = useState<ActiveTool>("crop");
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("original");
  const [saved, setSaved] = useState<{ outPath: string; width: number; height: number; bytes: number } | null>(null);

  const job = useJobRunner<BatchResult>("image_editor", {
    onDone: (res) => {
      if (res.failed > 0) notify.warning(t("common.errorsCount", { count: res.failed }));
    },
    onError: (err) => notify.error(t("imageTools.toast.error"), { body: err }),
  });

  const current = files[selected] ?? null;
  const ops = useMemo(
    () => (current && preview ? (opsByFile[current] ?? createDefaultOperations(preview.width, preview.height)) : null),
    [current, preview, opsByFile],
  );

  const resetResults = () => {
    job.reset();
    setSaved(null);
  };

  const addFiles = (paths: string[]) => {
    if (!paths.length) return;
    resetResults();
    setFiles((prev) => Array.from(new Set([...prev, ...paths])));
  };

  const browse = async () => addFiles(await api.dialogs.openFiles([dialogFilter(t, "images")]));

  const removeAt = (index: number) => {
    resetResults();
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setSelected((s) => Math.max(0, s > index ? s - 1 : Math.min(s, files.length - 2)));
  };

  const clear = () => {
    resetResults();
    setFiles([]);
    setOpsByFile({});
    setSelected(0);
  };

  useIncomingTransfer("image_tools", addFiles);

  useEffect(() => {
    setPreview(null);
    setTransformed(null);
    if (!current) return;
    let live = true;
    api.image_editor
      .loadPreview(current)
      .then((data) => {
        if (!live) return;
        setPreview(data);
        setSizes((prev) => ({ ...prev, [current]: { width: data.width, height: data.height } }));
        setOpsByFile((prev) => (prev[current] ? prev : { ...prev, [current]: createDefaultOperations(data.width, data.height) }));
      })
      .catch((err) => notify.error(String(err)));
    return () => {
      live = false;
    };
  }, [current, notify]);

  // Sync the crop box with the stored crop whenever the file changes or its preview arrives.
  useEffect(() => {
    if (preview && ops) setCrop(cropOf(ops, preview.width, preview.height));
    // Only on file/preview change; `ops` changes on every edit and must not reset an in-progress crop.
  }, [preview]);

  useEffect(() => {
    if (!current || !preview || !ops) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      setUpdating(true);
      try {
        const res = await api.image_editor.previewTransform(current, compileOps(ops, preview.width, preview.height));
        if (live) setTransformed(res);
      } catch (err) {
        console.warn("Image preview failed:", err);
      } finally {
        if (live) setUpdating(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [current, preview, ops]);

  const updateOps = (updater: (prev: ImageOperations) => ImageOperations) => {
    if (!current || !preview) return;
    resetResults();
    setOpsByFile((prev) => ({ ...prev, [current]: updater(prev[current] ?? createDefaultOperations(preview.width, preview.height)) }));
  };

  const applyCrop = () => {
    updateOps((prev) => ({ ...prev, cropActive: true, cropX: crop.x, cropY: crop.y, cropW: crop.w, cropH: crop.h }));
    setActiveTool("select");
  };

  const cancelCrop = () => {
    if (preview && ops) setCrop(cropOf(ops, preview.width, preview.height));
    setActiveTool("select");
  };

  const resetCrop = () => {
    if (!preview) return;
    updateOps((prev) => ({ ...prev, cropActive: false, cropPreset: "free", cropX: 0, cropY: 0, cropW: preview.width, cropH: preview.height }));
    setCrop({ x: 0, y: 0, w: preview.width, h: preview.height });
  };

  const changeCropPreset = (preset: string) => {
    if (!preview) return;
    updateOps((prev) => ({ ...prev, cropPreset: preset }));
    const ratio = CROP_RATIOS[preset];
    if (!ratio) return;
    let w = preview.width;
    let h = Math.round(w / ratio);
    if (h > preview.height) {
      h = preview.height;
      w = Math.round(h * ratio);
    }
    setCrop({ x: Math.round((preview.width - w) / 2), y: Math.round((preview.height - h) / 2), w, h });
  };

  const resetAll = () => {
    if (!preview) return;
    updateOps(() => createDefaultOperations(preview.width, preview.height));
    setCrop({ x: 0, y: 0, w: preview.width, h: preview.height });
  };

  const applyToAll = () => {
    if (!ops) return;
    resetResults();
    setOpsByFile(Object.fromEntries(files.map((f) => [f, { ...ops }])));
    notify.success(t("imageTools.appliedToAll"));
  };

  const copyToClipboard = async () => {
    if (!transformed?.dataUrl) return;
    try {
      const blob = await (await fetch(transformed.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      notify.success(t("imageTools.copied"));
    } catch {
      notify.error(t("imageTools.toast.copyError"));
    }
  };

  const save = async () => {
    if (!current || !preview || !ops) return;
    if (files.length === 1) {
      const ext = preview.format.toLowerCase() === "jpeg" ? "jpg" : preview.format.toLowerCase();
      const outPath = await api.dialogs.saveFile(`${fileName(current).replace(/\.[^.]+$/, "")}_edited.${ext}`, [
        dialogFilter(t, "images", [`.${ext}`]),
        allFilesFilter(t),
      ]);
      if (!outPath) return;
      try {
        setSaved(await api.image_editor.saveTransformed(current, outPath, compileOps(ops, preview.width, preview.height)));
      } catch (err) {
        notify.error(t("imageTools.toast.error"), { body: String(err) });
      }
      return;
    }
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;
    const perFile = Object.fromEntries(
      files.map((f) => {
        const size = sizes[f];
        const fileOps = opsByFile[f];
        return [f, fileOps && size ? compileOps(fileOps, size.width, size.height) : {}];
      }),
    );
    job
      .start(() => api.image_editor.startBatch(files, outDir, perFile, outputFormat === "original" ? undefined : outputFormat))
      .catch((err) => notify.error(String(err)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!preview || (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))) return;
      const key = e.key.toLowerCase();
      if (key === "c") setActiveTool("crop");
      else if (key === "r") setActiveTool("resize");
      else if (key === "t") setActiveTool("transform");
      else if (key === "v") setActiveTool("select");
      else if (e.key === "Enter" && activeTool === "crop") applyCrop();
      else if (e.key === "Escape" && activeTool === "crop") cancelCrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!files.length) {
    return (
      <Page title={t("tools.image_tools.name")} description={t("tools.image_tools.description")} icon={tool.icon} accent={tool.accent}>
        <DropZone
          icon={Image24Regular}
          title={t("imageTools.dropTitle")}
          hint={t("imageTools.dropHint")}
          accept={IMAGE_EXTENSIONS}
          onFiles={addFiles}
          onBrowse={browse}
        />
      </Page>
    );
  }

  const edited = new Set(files.filter((f) => isEdited(opsByFile[f])));
  const resized = transformed && preview && (transformed.width !== preview.width || transformed.height !== preview.height);
  const result = job.result;
  const formatLabel = (f: OutputFormat) => (f === "original" ? t("compressor.formatOriginal") : f.toUpperCase());

  return (
    <Page title={t("tools.image_tools.name")} description={t("tools.image_tools.description")} icon={tool.icon} accent={tool.accent}>
      {preview && ops && (
        <ToolOptionsBar
          activeTool={activeTool}
          ops={ops}
          naturalWidth={preview.width}
          naturalHeight={preview.height}
          onOpsChange={updateOps}
          onCropPresetChange={changeCropPreset}
        />
      )}

      <div className={styles.stageRow}>
        <ImageToolbox activeTool={activeTool} onSelectTool={setActiveTool} onReset={resetAll} disabled={!preview} />

        <Panel
          className={styles.viewer}
          title={current ? fileName(current) : undefined}
          actions={
            <>
              <Button appearance="subtle" icon={<Add16Regular />} onClick={browse}>
                {t("common.addFiles")}
              </Button>
              {!result && !saved && (
                <Button appearance="subtle" icon={<ArrowRight16Regular />} onClick={() => useTransferStore.getState().openModal(files, "image_tools")}>
                  {t("transfer.sendTo")}
                </Button>
              )}
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => removeAt(selected)}>
                {t("common.remove")}
              </Button>
            </>
          }
        >
          {preview && (
            <Caption1 className={styles.meta}>
              {preview.width} × {preview.height} px · {preview.format.toUpperCase()} · {formatBytes(preview.size)}
              {resized && ` → ${transformed.width} × ${transformed.height} px`}
            </Caption1>
          )}
          <div className={styles.canvas}>
            {preview && ops ? (
              <ImageCanvasStage
                imageSrc={activeTool === "crop" ? preview.dataUrl : (transformed?.dataUrl ?? preview.dataUrl)}
                naturalWidth={preview.width}
                naturalHeight={preview.height}
                activeTool={activeTool}
                crop={crop}
                cropPreset={ops.cropPreset}
                isLoading={updating}
                onCropChange={setCrop}
                onApplyCrop={applyCrop}
                onCancelCrop={cancelCrop}
                onResetCrop={resetCrop}
              />
            ) : (
              <Spinner label={t("common.loading")} />
            )}
          </div>
        </Panel>
      </div>

      {files.length > 1 && (
        <FileStrip
          files={files}
          selected={selected}
          onSelect={setSelected}
          onRemove={removeAt}
          edited={edited}
          actions={
            <>
              <Button appearance="subtle" icon={<CopySelect20Regular />} onClick={applyToAll}>
                {t("imageTools.applyToAll")}
              </Button>
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={clear}>
                {t("common.clearAll")}
              </Button>
            </>
          }
        />
      )}

      {saved && (
        <ResultCard
          title={t("imageTools.toast.saveSuccess")}
          detail={`${saved.width} × ${saved.height} px · ${formatBytes(saved.bytes)}`}
          path={saved.outPath}
          sourceToolId="image_tools"
        />
      )}

      {result && result.results.length > 0 && (
        <AfterGallery
          title={t("transfer.processedTitle")}
          summary={t("imageTools.toast.batchSuccess", { count: result.processed })}
          files={result.files || result.results.map((r) => r.dest)}
          items={result.results.map((r) => ({ file: r.file, dest: r.dest, name: fileName(r.dest), size: r.bytes, width: r.width, height: r.height }))}
          outputDir={result.outputDir}
          sourceToolId="image_tools"
        />
      )}

      <ActionBar job={job.job?.status === "done" ? undefined : job.job} onCancel={job.cancel}>
        <Button icon={<Copy16Regular />} disabled={!transformed} onClick={copyToClipboard}>
          {t("imageTools.copyClipboard")}
        </Button>
        {files.length > 1 && (
          <Dropdown
            className={styles.format}
            aria-label={t("compressor.format")}
            value={formatLabel(outputFormat)}
            selectedOptions={[outputFormat]}
            onOptionSelect={(_, d) => setOutputFormat(d.optionValue as OutputFormat)}
          >
            {OUTPUT_FORMATS.map((f) => (
              <Option key={f} value={f}>
                {formatLabel(f)}
              </Option>
            ))}
          </Dropdown>
        )}
        <Button appearance="primary" icon={<Save16Regular />} disabled={!preview || job.running} onClick={save}>
          {files.length > 1 ? t("imageTools.processBatch", { count: files.length }) : t("imageTools.saveAction")}
        </Button>
      </ActionBar>
    </Page>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Button, Caption1, Field, makeStyles, Spinner, tokens, useEventCallback } from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowRight16Regular,
  Copy16Regular,
  CopySelect20Regular,
  Delete16Regular,
  ErrorCircle24Regular,
  Image24Regular,
  Save16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { hasCommandModifier, isTypingTarget } from "../../lib/keyboard";
import { AfterGallery } from "../../components/AfterGallery";
import { DropZone } from "../../components/DropZone";
import { EmptyState } from "../../components/EmptyState";
import { FileStrip } from "../../components/FileStrip";
import { ImageCanvasStage } from "../../components/ImageCanvasStage";
import type { CropRect } from "../../components/InteractiveCropOverlay";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { api } from "../../lib/bridge";
import { dialogFilter, formatList, formatName, IMAGE_EXTENSIONS, imageFormatLabel, type ImageOutputFormat } from "../../lib/fileTypes";
import { fileName, formatBytes, joinPath } from "../../lib/format";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useAcceptFiles } from "../../lib/useAcceptFiles";
import { useTransferStore } from "../../stores/transfer";
import { ImageToolbox } from "./ImageToolbox";
import { ToolOptionsBar } from "./ToolOptionsBar";
import { compileOps, CROP_RATIOS, fitOps, isEdited } from "./operations";
import {
  type ActiveTool,
  type BatchResult,
  type ImageOperations,
  type PreviewData,
  type TransformResult,
  createDefaultOperations,
} from "./types";
import { errorMessage } from "../../lib/errors";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { addUnique, removeFileAt } from "../../lib/fileList";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { useImageToolsForm } from "./store";

const PREVIEW_DELAY_MS = 150;
const OUTPUT_FORMATS: ImageOutputFormat[] = ["original", "png", "jpeg", "webp"];


const useStyles = makeStyles({
  stageRow: { display: "flex", gap: "12px", alignItems: "stretch", minHeight: "520px", height: "68vh" },
  viewer: { flexGrow: 1, minWidth: 0 },
  canvas: { flexGrow: 1, minHeight: 0, display: "flex", overflow: "hidden" },
  meta: { color: tokens.colorNeutralForeground3 },
  format: { minWidth: "160px" },
  output: { display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" },
  folder: { flex: "1 1 320px", minWidth: 0 },
});

const cropOf = (ops: ImageOperations, width: number, height: number): CropRect =>
  ops.cropActive ? { x: ops.cropX, y: ops.cropY, w: ops.cropW, h: ops.cropH } : { x: 0, y: 0, w: width, h: height };

export default function ImageToolsPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const form = useImageToolsForm();
  const { files, selected, opsByFile, sizes, activeTool, outputFormat, saved } = form;
  const outputDir = useOutputDir(form.outputDir);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [transformed, setTransformed] = useState<TransformResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const setActiveTool = (tool: ActiveTool) => form.set({ activeTool: tool });
  const setOpsByFile = (update: (prev: Record<string, ImageOperations>) => Record<string, ImageOperations>) =>
    form.set({ opsByFile: update(useImageToolsForm.getState().opsByFile) });

  const job = useJobRunner<BatchResult>("image_editor", {
    onDone: (res) => {
      if (!res.processed) notify.warning(t("common.errorsCount", { count: res.failed }));
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
    form.set({ saved: null });
  };

  const acceptFiles = useAcceptFiles(IMAGE_EXTENSIONS);
  const addFiles = (paths: string[]) => {
    const accepted = acceptFiles(paths);
    if (!accepted.length) return;
    resetResults();
    form.set({ files: addUnique(useImageToolsForm.getState().files, accepted) });
  };

  const browse = async () => addFiles(await api.dialogs.openFiles([dialogFilter(t, "images")]));

  const removeAt = (index: number) => {
    resetResults();
    form.set(removeFileAt(files, selected, index));
  };

  const clear = () => {
    resetResults();
    form.set({ files: [], opsByFile: {}, sizes: {}, selected: 0 });
  };

  useIncomingTransfer("image_tools", addFiles);

  useEffect(() => {
    setPreview(null);
    setTransformed(null);
    setPreviewError(null);
    if (!current) return;
    let live = true;
    api.image_editor
      .loadPreview(current)
      .then((data) => {
        if (!live) return;
        setPreview(data);
        const state = useImageToolsForm.getState();
        state.set({ sizes: { ...state.sizes, [current]: { width: data.width, height: data.height } } });
        const { opsByFile } = useImageToolsForm.getState();
        const existing = opsByFile[current];
        // Edits copied from a photo of another size are carried over to this one's size.
        if (!existing || existing.baseWidth !== data.width || existing.baseHeight !== data.height) {
          const fitted = existing ? fitOps(existing, data.width, data.height) : createDefaultOperations(data.width, data.height);
          state.set({ opsByFile: { ...opsByFile, [current]: fitted } });
        }
      })
      .catch((err) => live && setPreviewError(errorMessage(t, err)));
    return () => {
      live = false;
    };
  }, [current, t]);

  // Sync the crop box with the stored crop whenever the file changes or its preview arrives.
  useEffect(() => {
    if (preview && ops) setCrop(cropOf(ops, preview.width, preview.height));
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps -- `ops` changes on every edit and must not reset an in-progress crop

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
    form.set({ opsByFile: Object.fromEntries(files.map((f) => [f, { ...ops }])) });
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

  // A file that cannot be previewed must not block saving the others.
  const canSave = !job.running && !!outputDir && (!!preview || files.length > 1);
  const save = async () => {
    if (!outputDir) return;
    if (files.length === 1) {
      if (!current || !preview || !ops) return;
      const ext = preview.format.toLowerCase() === "jpeg" ? "jpg" : preview.format.toLowerCase();
      const outPath = joinPath(outputDir, `${fileName(current).replace(/\.[^.]+$/, "")}_edited.${ext}`);
      try {
        form.set({ saved: await api.image_editor.saveTransformed(current, outPath, compileOps(ops, preview.width, preview.height)) });
      } catch (err) {
        notify.error(t("imageTools.toast.error"), { body: errorMessage(t, err) });
      }
      return;
    }
    // Files never opened have no known size yet; crop and resize need it to fit each photo.
    const unknown = files.filter((f) => opsByFile[f] && !sizes[f]);
    let known = sizes;
    if (unknown.length) {
      try {
        const found = await api.image_editor.sizes(unknown);
        known = { ...sizes };
        unknown.forEach((f, i) => {
          const size = found[i];
          if (size) known[f] = size;
        });
        form.set({ sizes: known });
      } catch (err) {
        notify.error(t("imageTools.toast.error"), { body: errorMessage(t, err) });
        return;
      }
    }
    const perFile = Object.fromEntries(
      files.map((f) => {
        const fileOps = opsByFile[f];
        if (!fileOps) return [f, {}];
        const size = known[f] ?? { width: fileOps.baseWidth ?? 0, height: fileOps.baseHeight ?? 0 };
        return [f, compileOps(fileOps, size.width, size.height)];
      }),
    );
    job
      .start(() => api.image_editor.startBatch(files, outputDir, perFile, outputFormat === "original" ? undefined : outputFormat))
      .catch((err) => notify.error(errorMessage(t, err)));
  };

  const onKey = useEventCallback((e: KeyboardEvent) => {
    if (!preview || hasCommandModifier(e) || isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === "c") setActiveTool("crop");
    else if (key === "r") setActiveTool("resize");
    else if (key === "t") setActiveTool("transform");
    else if (key === "v") setActiveTool("select");
    else if ((e.key === "Enter" || e.key === "Escape") && activeTool === "crop") {
      e.preventDefault();
      if (e.key === "Enter") applyCrop();
      else cancelCrop();
    }
  });

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  useToolShortcuts({ run: canSave && save, open: browse });

  if (!files.length) {
    return (
      <ToolPage toolId="image_tools">
        <DropZone
          fill
          icon={Image24Regular}
          title={t("imageTools.dropTitle")}
          hint={t("imageTools.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
          accept={IMAGE_EXTENSIONS}
          onFiles={addFiles}
          onBrowse={browse}
        />
      </ToolPage>
    );
  }

  const edited = new Set(files.filter((f) => isEdited(opsByFile[f])));
  const resized = transformed && preview && (transformed.width !== preview.width || transformed.height !== preview.height);
  const result = job.result;

  return (
    <ToolPage toolId="image_tools">
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
              {preview.width} × {preview.height} px · {formatName(preview.format)} · {formatBytes(preview.size)}
              {resized && ` → ${transformed.width} × ${transformed.height} px`}
            </Caption1>
          )}
          <div className={styles.canvas}>
            {preview && ops ? (
              <ImageCanvasStage
                imageSrc={activeTool === "crop" ? preview.dataUrl : (transformed?.dataUrl ?? preview.dataUrl)}
                naturalWidth={preview.width}
                naturalHeight={preview.height}
                cropping={activeTool === "crop"}
                crop={crop}
                cropPreset={ops.cropPreset}
                isLoading={updating}
                onCropChange={setCrop}
                onApplyCrop={applyCrop}
                onCancelCrop={cancelCrop}
                onResetCrop={resetCrop}
              />
            ) : previewError ? (
              <EmptyState icon={ErrorCircle24Regular} title={previewError} />
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
          onSelect={(index) => form.set({ selected: index })}
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

      <Panel>
        <div className={styles.output}>
          <OutputFolderField className={styles.folder} value={form.outputDir} onChange={(dir) => form.set({ outputDir: dir })} />
          {files.length > 1 && (
            <Field label={t("common.outputFormat")}>
              <Select
                searchable
                className={styles.format}
                options={OUTPUT_FORMATS.map((f) => ({ value: f, label: imageFormatLabel(t, f) }))}
                value={outputFormat}
                onChange={(next) => form.set({ outputFormat: next })}
              />
            </Field>
          )}
        </div>
      </Panel>

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
          summary={[
            t("imageTools.toast.batchSuccess", { count: result.processed }),
            result.failed > 0 && t("common.errorsCount", { count: result.failed }),
          ]
            .filter(Boolean)
            .join(" · ")}
          files={result.files || result.results.map((r) => r.dest)}
          items={result.results.map((r) => ({ file: r.file, dest: r.dest, name: fileName(r.dest), size: r.bytes, width: r.width, height: r.height }))}
          outputDir={result.outputDir}
          sourceToolId="image_tools"
        />
      )}

      <ActionBar job={job.job} idleText={files.length ? t("common.idle.filesReady", { count: files.length }) : t("common.idle.pickFiles")} onCancel={job.cancel}>
        <Button icon={<Copy16Regular />} disabled={!transformed} onClick={copyToClipboard}>
          {t("imageTools.copyClipboard")}
        </Button>
        <Button appearance="primary" icon={<Save16Regular />} disabled={!canSave} onClick={save}>
          {files.length > 1 ? t("imageTools.processBatch", { count: files.length }) : t("imageTools.saveAction")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

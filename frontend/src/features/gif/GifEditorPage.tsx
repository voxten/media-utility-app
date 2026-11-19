import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Caption1, Field, makeStyles, Spinner, Switch, ToggleButton, tokens, Tooltip } from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowReset20Regular,
  ArrowRotateClockwise20Regular,
  ArrowRotateCounterclockwise20Regular,
  CopySelect20Regular,
  Crop16Regular,
  Delete16Regular,
  Eye16Regular,
  FlipHorizontal20Regular,
  FlipVertical20Regular,
  Gif24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { AfterGallery } from "../../components/AfterGallery";
import { DropZone } from "../../components/DropZone";
import { FileStrip } from "../../components/FileStrip";
import { ImageCanvasStage } from "../../components/ImageCanvasStage";
import type { CropRect } from "../../components/InteractiveCropOverlay";
import { useNotify } from "../../components/notify";
import { Columns } from "../../components/Columns";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { SliderField } from "../../components/SliderField";
import { TrimTimeline } from "../../components/timeline/TrimTimeline";
import { TrimFields } from "../../components/timeline/TrimFields";
import { api } from "../../lib/bridge";
import { ANIMATION_EXTENSIONS, dialogFilter, formatList, formatName } from "../../lib/fileTypes";
import { fileName, formatBytes, formatDuration } from "../../lib/format";
import { IMAGE_STAGE_HEIGHT } from "../../lib/imageStage";
import type { AnimationInfo, GifEditorPreview, GifEditorResult, GifFormat, GifOperations } from "../../lib/types";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useAcceptFiles } from "../../lib/useAcceptFiles";
import { GifOutputPanel } from "./GifOutputPanel";
import { useCropKeys } from "./useCropKeys";
import { useFrameLoader } from "./useFrameLoader";
import { useGifOutput } from "./useGifOutput";
import { errorMessage } from "../../lib/errors";
import { useOutputDir } from "../../components/OutputFolderField";
import { addUnique, removeFileAt } from "../../lib/fileList";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { NO_EDITS, useGifEditorForm, type Edits } from "./store";

const FORMATS: GifFormat[] = ["gif", "webp", "apng", "mp4"];

function toOperations(edits: Edits): GifOperations {
  const ops: GifOperations = {};
  if (edits.trim) ops.trim = edits.trim;
  if (edits.crop) ops.crop = { x: edits.crop.x, y: edits.crop.y, width: edits.crop.w, height: edits.crop.h };
  if (edits.rotate) ops.rotate = edits.rotate;
  if (edits.flipH) ops.flip_h = true;
  if (edits.flipV) ops.flip_v = true;
  if (edits.scale < 100) ops.resize = { percent: edits.scale };
  if (edits.speed !== 1) ops.speed = edits.speed;
  if (edits.reverse) ops.reverse = true;
  if (edits.boomerang) ops.boomerang = true;
  return ops;
}

const isEdited = (edits: Edits | undefined) => !!edits && Object.keys(toOperations(edits)).length > 0;

const useStyles = makeStyles({
  stage: { height: IMAGE_STAGE_HEIGHT, minHeight: "280px" },
  meta: { display: "flex", gap: "12px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  saved: { color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px 24px", alignItems: "end" },
  buttons: { display: "flex", gap: "4px" },
});

export default function GifEditorPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const form = useGifEditorForm();
  const { files, selected, editsByFile } = form;
  const outputDir = useOutputDir(form.outputDir);
  const [info, setInfo] = useState<AnimationInfo | null>(null);
  const [gifsicle, setGifsicle] = useState(false);
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(null);
  const [preview, setPreview] = useState<GifEditorPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const output = useGifOutput("gif_editor", FORMATS, gifsicle);
  const job = useJobRunner<GifEditorResult>("gif_editor", {
    onError: (err) => notify.error(t("gif_editor.errors.render"), { body: err }),
  });

  const current = files[selected] ?? null;
  const edits = (current && editsByFile[current]) || NO_EDITS;
  const operations = useMemo(() => toOperations(edits), [edits]);
  const loadFrames = useFrameLoader(api.gif_editor.frames, current);

  const acceptFiles = useAcceptFiles(ANIMATION_EXTENSIONS);
  const addFiles = (paths: string[]) => {
    const accepted = acceptFiles(paths);
    if (!accepted.length) return;
    job.reset();
    form.set({ files: addUnique(useGifEditorForm.getState().files, accepted) });
  };

  const browse = async () => addFiles(await api.dialogs.openFiles([dialogFilter(t, "animations")]));

  useIncomingTransfer("gif_editor", addFiles);

  const removeAt = (index: number) => {
    job.reset();
    form.set(removeFileAt(files, selected, index));
  };

  const clear = () => {
    job.reset();
    form.set({ files: [], selected: 0, editsByFile: {} });
  };

  const setEdits = (patch: Partial<Edits>) => {
    if (!current) return;
    job.reset();
    const prev = useGifEditorForm.getState().editsByFile;
    form.set({ editsByFile: { ...prev, [current]: { ...(prev[current] ?? NO_EDITS), ...patch } } });
  };

  const applyToAll = () => form.set({ editsByFile: Object.fromEntries(files.map((f) => [f, edits])) });

  useEffect(() => {
    setInfo(null);
    setDraftCrop(null);
    if (!current) return;
    let live = true;
    api.gif_editor
      .load(current)
      .then((res) => {
        if (!live) return;
        setInfo(res);
        setGifsicle(res.gifsicle);
      })
      .catch((err) => notify.error(t("gif_editor.errors.load"), { body: errorMessage(t, err) }));
    return () => {
      live = false;
    };
  }, [current, notify, t]);

  const previewRequest = useRef(0);
  useEffect(() => {
    previewRequest.current += 1;
    setPreview(null);
    setPreviewing(false);
  }, [current, operations, output.params]);

  const runPreview = async () => {
    if (!current) return;
    const request = ++previewRequest.current;
    setPreviewing(true);
    try {
      const result = await api.gif_editor.preview(current, operations, output.params);
      if (request === previewRequest.current) setPreview(result);
    } catch (err) {
      if (request === previewRequest.current) notify.error(t("gif_editor.errors.preview"), { body: errorMessage(t, err) });
    } finally {
      if (request === previewRequest.current) setPreviewing(false);
    }
  };

  const canStart = !!info && !job.running && draftCrop === null && !!outputDir;
  const start = () => {
    output.remember();
    const perFile = Object.fromEntries(files.map((f) => [f, toOperations(editsByFile[f] ?? NO_EDITS)]));
    job
      .start(() => api.gif_editor.start({ files, outputDir, operations: perFile, output: output.params }))
      .catch((err) => notify.error(t("gif_editor.errors.render"), { body: errorMessage(t, err) }));
  };

  const applyCrop = () => {
    if (!info || !draftCrop) return;
    const full = draftCrop.w >= info.width && draftCrop.h >= info.height;
    setEdits({ crop: full ? null : draftCrop });
    setDraftCrop(null);
  };

  useCropKeys(draftCrop !== null, applyCrop, () => setDraftCrop(null));
  useToolShortcuts({ run: canStart && start, open: browse });

  if (!files.length) {
    return (
      <ToolPage toolId="gif_editor">
        <DropZone
          fill
          icon={Gif24Regular}
          title={t("gif_editor.dropTitle")}
          hint={t("gif_editor.dropHint", { formats: formatList(ANIMATION_EXTENSIONS) })}
          accept={ANIMATION_EXTENSIONS}
          onFiles={addFiles}
          onBrowse={browse}
        />
      </ToolPage>
    );
  }

  const fullCrop: CropRect | null = info && { x: 0, y: 0, w: info.width, h: info.height };
  const area = edits.crop ?? fullCrop;
  const cropping = draftCrop !== null;
  const quarterTurn = edits.rotate % 180 !== 0;
  const outWidth = area ? Math.max(1, Math.floor(((quarterTurn ? area.h : area.w) * edits.scale) / 100)) : 0;
  const outHeight = area ? Math.max(1, Math.floor(((quarterTurn ? area.w : area.h) * edits.scale) / 100)) : 0;
  const trim = edits.trim ?? { start: 0, end: info?.duration ?? 0 };
  const showPreview = !cropping && preview;
  const result = job.result;
  const single = result?.results.length === 1 && files.length === 1 ? result.results[0] : null;
  const edited = new Set(files.filter((f) => isEdited(editsByFile[f])));

  const changeTrim = (start: number, end: number) => {
    if (!info) return;
    setEdits({ trim: start <= 0 && end >= info.duration ? null : { start, end } });
  };

  const options = (
    <>
      <Panel
        title={t("gif_editor.edit")}
        actions={
          <Button appearance="subtle" icon={<ArrowReset20Regular />} disabled={!isEdited(edits)} onClick={() => setEdits(NO_EDITS)}>
            {t("gif_editor.reset")}
          </Button>
        }
      >
        <div className={styles.grid}>
          <SliderField label={t("gif_editor.scale")} value={edits.scale} min={10} max={100} step={5} format={(v) => `${v}%`} onChange={(scale) => setEdits({ scale })} />
          <SliderField label={t("gif.speed")} value={edits.speed} min={0.25} max={4} step={0.25} format={(v) => `${v}×`} onChange={(speed) => setEdits({ speed })} />
          <Field label={t("gif_editor.orientation")}>
            <div className={styles.buttons}>
              <Tooltip content={t("gif_editor.rotateLeft")} relationship="label">
                <Button icon={<ArrowRotateCounterclockwise20Regular />} onClick={() => setEdits({ rotate: (edits.rotate + 270) % 360 })} />
              </Tooltip>
              <Tooltip content={t("gif_editor.rotateRight")} relationship="label">
                <Button icon={<ArrowRotateClockwise20Regular />} onClick={() => setEdits({ rotate: (edits.rotate + 90) % 360 })} />
              </Tooltip>
              <Tooltip content={t("gif_editor.flipH")} relationship="label">
                <ToggleButton checked={edits.flipH} icon={<FlipHorizontal20Regular />} onClick={() => setEdits({ flipH: !edits.flipH })} />
              </Tooltip>
              <Tooltip content={t("gif_editor.flipV")} relationship="label">
                <ToggleButton checked={edits.flipV} icon={<FlipVertical20Regular />} onClick={() => setEdits({ flipV: !edits.flipV })} />
              </Tooltip>
            </div>
          </Field>
          <Switch checked={edits.reverse} label={t("gif.reverse")} onChange={(_, d) => setEdits({ reverse: d.checked })} />
          <Switch checked={edits.boomerang} label={t("gif_editor.boomerang")} onChange={(_, d) => setEdits({ boomerang: d.checked })} />
        </div>
      </Panel>

      <GifOutputPanel
        output={output}
        onGifsicleInstalled={() => setGifsicle(true)}
        outputDir={form.outputDir}
        onOutputDirChange={(dir) => form.set({ outputDir: dir })}
      />
    </>
  );

  return (
    <ToolPage toolId="gif_editor">
      <Columns side={options}>
        <Panel
          title={current ? fileName(current) : undefined}
          actions={
            <>
              <Button appearance="subtle" icon={<Crop16Regular />} disabled={!area || cropping} onClick={() => setDraftCrop(area)}>
                {t("gif_editor.crop")}
              </Button>
              <Button appearance="subtle" icon={<Add16Regular />} onClick={browse}>
                {t("common.addFiles")}
              </Button>
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => removeAt(selected)}>
                {t("common.remove")}
              </Button>
            </>
          }
        >
          <div className={styles.stage}>
            {info && area ? (
              <ImageCanvasStage
                imageSrc={showPreview ? preview.dataUrl : info.dataUrl}
                naturalWidth={showPreview ? preview.width : info.width}
                naturalHeight={showPreview ? preview.height : info.height}
                cropping={cropping}
                crop={draftCrop ?? area}
                cropPreset="free"
                onCropChange={setDraftCrop}
                onApplyCrop={applyCrop}
                onCancelCrop={() => setDraftCrop(null)}
                onResetCrop={() => fullCrop && setDraftCrop(fullCrop)}
              />
            ) : (
              <Spinner label={t("common.loading")} />
            )}
          </div>
          {info && (
            <Caption1 className={styles.meta}>
              <span>
                {info.width} × {info.height} px → {outWidth} × {outHeight} px
              </span>
              <span>
                {t("gif_editor.frameCount", { count: info.frames })} · {formatDuration(info.duration)} · {formatName(info.format)}
              </span>
              <span>
                {formatBytes(info.size)}
                {preview && (
                  <>
                    {" → "}
                    <span className={styles.saved}>{formatBytes(preview.size)}</span>
                  </>
                )}
              </span>
            </Caption1>
          )}
          {info && info.frames > 1 && (
            <>
              <TrimTimeline
                duration={info.duration}
                frameAspect={info.height > 0 ? info.width / info.height : 0}
                loadFrames={loadFrames}
                start={trim.start}
                end={trim.end}
                onChange={changeTrim}
                minLength={info.duration / info.frames}
                snap={0.01}
              />
              <TrimFields
                start={trim.start}
                end={trim.end}
                duration={info.duration}
                onChange={changeTrim}
                minLength={info.duration / info.frames}
                outputSeconds={((trim.end - trim.start) / edits.speed) * (edits.boomerang ? 2 : 1)}
              />
            </>
          )}

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
                    {t("gif_editor.applyToAll")}
                  </Button>
                  <Button appearance="subtle" icon={<Delete16Regular />} onClick={clear}>
                    {t("common.clearAll")}
                  </Button>
                </>
              }
            />
          )}
        </Panel>

        {single && (
          <ResultCard
            title={t("gif_editor.done")}
            detail={`${single.width} × ${single.height} px · ${formatBytes(single.originalSize)} → ${formatBytes(single.size)}`}
            path={single.dest}
            sourceToolId="gif_editor"
          />
        )}
        {result && !single && result.results.length > 0 && (
          <AfterGallery
            title={t("transfer.processedTitle")}
            summary={[
              t("gif_editor.summary", { processed: result.processed, total: result.total, percent: result.savedPercent }),
              result.failed > 0 && t("common.errorsCount", { count: result.failed }),
            ]
              .filter(Boolean)
              .join(" · ")}
            files={result.files}
            items={result.results.map((r) => ({
              file: r.file,
              dest: r.dest,
              name: fileName(r.dest),
              originalSize: r.originalSize,
              size: r.size,
              savedPercent: r.savedPercent,
              width: r.width,
              height: r.height,
            }))}
            outputDir={result.outputDir}
            sourceToolId="gif_editor"
          />
        )}
      </Columns>

      <ActionBar job={job.job} idleText={files.length ? t("common.idle.filesReady", { count: files.length }) : t("common.idle.pickFiles")} onCancel={job.cancel}>
        <Button icon={<Eye16Regular />} disabled={!info || previewing || job.running || cropping} onClick={runPreview}>
          {previewing ? t("common.loading") : t("gif.preview")}
        </Button>
        <Button appearance="primary" icon={<Gif24Regular />} disabled={!canStart} onClick={start}>
          {files.length > 1 ? t("gif_editor.saveAll", { count: files.length }) : t("gif_editor.save", { format: formatName(output.output.format) })}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

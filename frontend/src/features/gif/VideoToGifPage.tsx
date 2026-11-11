import { useEffect, useMemo, useState } from "react";
import { Button, Caption1, Field, Input, makeStyles, Switch, tokens } from "@fluentui/react-components";
import { Crop16Regular, Eye16Regular, FilmstripImage24Regular, VideoSwitch20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { ImageCanvasStage } from "../../components/ImageCanvasStage";
import type { CropRect } from "../../components/InteractiveCropOverlay";
import { useNotify } from "../../components/notify";
import { Columns } from "../../components/Columns";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { SliderField } from "../../components/SliderField";
import { TrimTimeline } from "../../components/timeline/TrimTimeline";
import { api } from "../../lib/bridge";
import { allFilesFilter, dialogFilter, formatList, formatName, VIDEO_EXTENSIONS } from "../../lib/fileTypes";
import { formatBytes, formatDuration } from "../../lib/format";
import { IMAGE_STAGE_HEIGHT } from "../../lib/imageStage";
import type { GifFormat, VideoInfo, VideoToGifPreview, VideoToGifResult } from "../../lib/types";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { GifOutputPanel } from "./GifOutputPanel";
import { useCropKeys } from "./useCropKeys";
import { useFrameLoader } from "./useFrameLoader";
import { useGifOutput } from "./useGifOutput";
import { errorMessage, reportError } from "../../lib/errors";

const FORMATS: GifFormat[] = ["gif", "webp", "apng"];
const WIDTHS = [0, 240, 320, 480, 640, 800];
const DEFAULT_WIDTH = 480;
const DEFAULT_CLIP_SEC = 5;
const FRAME_DELAY_MS = 200;
const STILL_HEIGHT = 720;

type ProbedVideo = VideoInfo & { gifsicle: boolean };

const useStyles = makeStyles({
  stage: { height: IMAGE_STAGE_HEIGHT, minHeight: "280px" },
  meta: { display: "flex", gap: "12px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  times: { display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" },
  time: { width: "130px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px 24px", alignItems: "end" },
});

const round = (sec: number) => Math.round(sec * 100) / 100;

export default function VideoToGifPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const [video, setVideo] = useState<ProbedVideo | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [speed, setSpeed] = useState(1);
  const [reverse, setReverse] = useState(false);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(null);
  const [still, setStill] = useState<string | null>(null);
  const [preview, setPreview] = useState<VideoToGifPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const output = useGifOutput(FORMATS, video?.gifsicle ?? false);
  const job = useJobRunner<VideoToGifResult>("video_to_gif", {
    onError: (err) => notify.error(t("video_to_gif.errors.render"), { body: err }),
  });
  const loadFrames = useFrameLoader(api.video_to_gif.frames, video?.path ?? null);

  const load = async (path: string) => {
    try {
      const info = await api.video_to_gif.probe(path);
      if (!info.hasVideo) throw new Error(t("video_to_gif.errors.noVideo"));
      job.reset();
      setVideo(info);
      setRange({ start: 0, end: Math.min(info.duration, DEFAULT_CLIP_SEC) });
      setWidth(info.width > DEFAULT_WIDTH ? DEFAULT_WIDTH : 0);
      setCrop(null);
      setDraftCrop(null);
    } catch (err) {
      notify.error(t("video_to_gif.errors.load"), { body: errorMessage(t, err) });
    }
  };

  const browse = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "videos"), allFilesFilter(t)], false);
    if (path) load(path);
  };

  useIncomingTransfer("video_to_gif", (files) => {
    if (files[0]) load(files[0]);
  });

  const params = useMemo(
    () =>
      video && {
        path: video.path,
        duration: video.duration,
        start: range.start,
        end: range.end,
        fps,
        width,
        speed,
        reverse,
        crop: crop && { x: crop.x, y: crop.y, width: crop.w, height: crop.h },
        output: output.params,
      },
    [video, range, fps, width, speed, reverse, crop, output.params],
  );

  useEffect(() => setPreview(null), [params]);

  useEffect(() => {
    if (!video) return;
    let live = true;
    const timer = window.setTimeout(() => {
      api.video_to_gif
        .frames(video.path, range.start, 0.01, 1, Math.min(video.height, STILL_HEIGHT))
        .then((r) => live && r.frames[0] && setStill(r.frames[0].dataUrl))
        .catch((err) => reportError("preview", err));
    }, FRAME_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [video, range.start]);

  const runPreview = async () => {
    if (!params) return;
    setPreviewing(true);
    try {
      setPreview(await api.video_to_gif.preview(params));
    } catch (err) {
      notify.error(t("video_to_gif.errors.preview"), { body: errorMessage(t, err) });
    } finally {
      setPreviewing(false);
    }
  };

  const create = async () => {
    if (!params || !video) return;
    const name = `${video.fileName.replace(/\.[^.]+$/, "")}${output.extension}`;
    const outPath = await api.dialogs.saveFile(name, [`${formatName(output.output.format)} (*${output.extension})`]);
    if (!outPath) return;
    output.remember();
    job.start(() => api.video_to_gif.start({ ...params, outPath }));
  };

  const applyCrop = () => {
    const full = draftCrop && video && draftCrop.w >= video.width && draftCrop.h >= video.height;
    setCrop(full ? null : draftCrop);
    setDraftCrop(null);
  };

  useCropKeys(draftCrop !== null, applyCrop, () => setDraftCrop(null));

  if (!video) {
    return (
      <ToolPage toolId="video_to_gif">
        <DropZone
          fill
          icon={FilmstripImage24Regular}
          title={t("video_to_gif.dropTitle")}
          hint={t("video_to_gif.dropHint", { formats: formatList(VIDEO_EXTENSIONS) })}
          accept={VIDEO_EXTENSIONS}
          onFiles={(files) => files[0] && load(files[0])}
          onBrowse={browse}
        />
      </ToolPage>
    );
  }

  const fullCrop: CropRect = { x: 0, y: 0, w: video.width, h: video.height };
  const area = crop ?? fullCrop;
  const outWidth = width || area.w;
  const outHeight = Math.round((area.h * outWidth) / area.w / 2) * 2;
  const cropping = draftCrop !== null;
  const showPreview = !cropping && preview;
  const clipSeconds = (range.end - range.start) / speed;
  const result = job.result;

  const options = (
    <>
      <Panel title={t("video_to_gif.frames")}>
        <div className={styles.grid}>
          <SliderField label={t("video_to_gif.fps")} value={fps} min={5} max={30} onChange={setFps} />
          <Field label={t("video_to_gif.width")}>
            <Select
              options={WIDTHS.map((w) => ({ value: String(w), label: w ? `${w} px` : t("common.formatOriginal") }))}
              value={String(width)}
              onChange={(w) => setWidth(Number(w))}
            />
          </Field>
          <SliderField label={t("gif.speed")} value={speed} min={0.25} max={4} step={0.25} format={(v) => `${v}×`} onChange={setSpeed} />
          <Switch checked={reverse} label={t("gif.reverse")} onChange={(_, d) => setReverse(d.checked)} />
        </div>
      </Panel>

      <GifOutputPanel output={output} onGifsicleInstalled={() => setVideo((v) => v && { ...v, gifsicle: true })} />
    </>
  );

  return (
    <ToolPage toolId="video_to_gif">
      <Columns side={options}>
        <Panel
          title={video.fileName}
          actions={
            <>
              <Button appearance="subtle" icon={<Crop16Regular />} disabled={cropping} onClick={() => setDraftCrop(area)}>
                {t("video_to_gif.crop")}
              </Button>
              <Button appearance="subtle" icon={<VideoSwitch20Regular />} onClick={browse}>
                {t("video_to_gif.changeVideo")}
              </Button>
            </>
          }
        >
          <div className={styles.stage}>
            <ImageCanvasStage
              imageSrc={showPreview ? preview.dataUrl : (still ?? video.thumbnail)}
              naturalWidth={showPreview ? outWidth : video.width}
              naturalHeight={showPreview ? outHeight : video.height}
              cropping={cropping}
              crop={draftCrop ?? area}
              cropPreset="free"
              onCropChange={setDraftCrop}
              onApplyCrop={applyCrop}
              onCancelCrop={() => setDraftCrop(null)}
              onResetCrop={() => setDraftCrop(fullCrop)}
            />
          </div>
          <Caption1 className={styles.meta}>
            <span>
              {video.width} × {video.height} px → {outWidth} × {outHeight} px
            </span>
            <span>{t("video_to_gif.frameCount", { count: Math.max(1, Math.round(clipSeconds * fps)) })}</span>
            {preview && <span>{t("video_to_gif.estimatedSize", { size: formatBytes(preview.estimatedSize) })}</span>}
          </Caption1>

          <TrimTimeline
            duration={video.duration}
            frameAspect={video.height > 0 ? video.width / video.height : 0}
            loadFrames={loadFrames}
            start={range.start}
            end={range.end}
            onChange={(start, end) => setRange({ start, end })}
            snap={0.01}
          />
          <div className={styles.times}>
            <Field label={t("video_to_gif.start")} className={styles.time}>
              <Input
                type="number"
                step={0.1}
                min={0}
                contentAfter="s"
                value={String(round(range.start))}
                onChange={(_, d) => {
                  const start = Math.max(0, Math.min(range.end - 0.1, Number(d.value) || 0));
                  setRange((r) => ({ ...r, start }));
                }}
              />
            </Field>
            <Field label={t("video_to_gif.end")} className={styles.time}>
              <Input
                type="number"
                step={0.1}
                min={0}
                contentAfter="s"
                value={String(round(range.end))}
                onChange={(_, d) => {
                  const end = Math.min(video.duration, Math.max(range.start + 0.1, Number(d.value) || 0));
                  setRange((r) => ({ ...r, end }));
                }}
              />
            </Field>
            <Caption1 className={styles.meta}>{t("video_to_gif.length", { duration: formatDuration(clipSeconds) })}</Caption1>
          </div>
        </Panel>

        {result && (
          <ResultCard
            title={t("video_to_gif.done")}
            detail={`${result.width} × ${result.height} px · ${t("video_to_gif.frameCount", { count: result.frames })} · ${formatBytes(result.size)}`}
            path={result.outPath}
            sourceToolId="video_to_gif"
          />
        )}
      </Columns>

      <ActionBar job={job.job?.status === "done" ? undefined : job.job} onCancel={job.cancel}>
        <Button icon={<Eye16Regular />} disabled={previewing || job.running || cropping} onClick={runPreview}>
          {previewing ? t("common.loading") : t("gif.preview")}
        </Button>
        <Button appearance="primary" icon={<FilmstripImage24Regular />} disabled={job.running || cropping} onClick={create}>
          {t("video_to_gif.create", { format: formatName(output.output.format) })}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

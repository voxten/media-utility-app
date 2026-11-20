import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input, Switch, Tab, TabList } from "@fluentui/react-components";
import { MusicNote216Regular, Play16Filled, Video16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { ActionBar } from "../../components/ActionBar";
import { Columns } from "../../components/Columns";
import { DropZone } from "../../components/DropZone";
import { FileList } from "../../components/FileList";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select, type SelectOption } from "../../components/Select";
import { TrimTimeline } from "../../components/timeline/TrimTimeline";
import { TrimFields } from "../../components/timeline/TrimFields";
import { api } from "../../lib/bridge";
import { errorMessage } from "../../lib/errors";
import { addUnique } from "../../lib/fileList";
import { AUDIO_EXTENSIONS, dialogFilter, formatList, formatOptions, VIDEO_EXTENSIONS } from "../../lib/fileTypes";
import { formatBytes } from "../../lib/format";
import type { MediaConvertResult, VideoCodec, VideoEncoders, VideoInfo } from "../../lib/types";
import { useAcceptFiles } from "../../lib/useAcceptFiles";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { useSettings } from "../../stores/settings";
import { useFrameLoader } from "../gif/useFrameLoader";

const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const VIDEO_FORMATS = ["mp4", "mkv", "mov", "webm"] as const;
const AUDIO_FORMATS = ["mp3", "m4a", "ogg", "opus", "wav", "flac"] as const;
type OutputFormat = (typeof VIDEO_FORMATS)[number] | (typeof AUDIO_FORMATS)[number];
const LOSSLESS = new Set<OutputFormat>(["wav", "flac"]);
const QUALITIES = ["high", "balanced", "small"] as const;
type Quality = (typeof QUALITIES)[number];
const HEIGHTS = ["0", "2160", "1440", "1080", "720", "480", "360"] as const;
type Height = (typeof HEIGHTS)[number];
const BITRATES = ["96", "128", "160", "192", "256", "320"] as const;
type Bitrate = (typeof BITRATES)[number];
type SizeMode = "quality" | "size" | "copy";
type VideoFormat = (typeof VIDEO_FORMATS)[number];
const ENCODE_CODECS: Record<VideoFormat, readonly VideoCodec[]> = {
  mp4: ["h264", "hevc", "av1"],
  mkv: ["h264", "hevc", "av1"],
  mov: ["h264", "hevc"],
  webm: ["vp9", "av1"],
};
const CODEC_LABELS: Record<VideoCodec, string> = { h264: "H.264", hevc: "H.265", av1: "AV1", vp9: "VP9" };

const isVideoFormat = (format: OutputFormat): format is VideoFormat => (VIDEO_FORMATS as readonly string[]).includes(format);

interface MediaConvertForm {
  files: string[];
  format: OutputFormat;
  codec: VideoCodec;
  sizeMode: SizeMode;
  quality: Quality;
  targetMb: number;
  height: Height;
  mute: boolean;
  audioKbps: Bitrate;
  normalize: boolean;
  /** Trim of the only file, in seconds; null keeps the whole file. */
  range: { start: number; end: number } | null;
  outputDir: string;
  set: (patch: Partial<Omit<MediaConvertForm, "set">>) => void;
}

const useForm = create<MediaConvertForm>((set) => ({
  files: [],
  format: "mp4",
  codec: "h264",
  sizeMode: "quality",
  quality: "balanced",
  targetMb: 25,
  height: "0",
  mute: false,
  audioKbps: "192",
  normalize: false,
  range: null,
  outputDir: "",
  set: (patch) => set(patch),
}));

export default function MediaConvertPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const form = useForm();
  const outputDir = useOutputDir(form.outputDir);
  const single = form.files.length === 1 ? form.files[0] : null;
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [encoders, setEncoders] = useState<VideoEncoders | null>(null);
  const [copyFormats, setCopyFormats] = useState<string[]>([]);
  const hardware = useSettings((s) => s.settings?.videoHardwareEncoding ?? true);
  const video = isVideoFormat(form.format);
  const copy = video && form.sizeMode === "copy";
  const av1Ready = hardware && !!encoders?.devices.some((device) => device.codecs.includes("av1"));
  const codecs = isVideoFormat(form.format) ? ENCODE_CODECS[form.format].filter((codec) => codec !== "av1" || av1Ready) : [];
  const codec = codecs.includes(form.codec) ? form.codec : (codecs[0] ?? "h264");

  const runner = useJobRunner<MediaConvertResult>("media_convert", {
    onError: (error) => notify.error(t("media_convert.toast.error"), { body: error }),
  });

  useEffect(() => {
    setInfo(null);
    if (!single) return;
    let current = true;
    api.media_convert
      .probe(single)
      .then((probed) => current && setInfo(probed))
      .catch((err) => current && notify.error(t("media_convert.toast.error"), { body: errorMessage(t, err) }));
    return () => {
      current = false;
    };
  }, [single, notify, t]);

  useEffect(() => {
    api.media_convert.encoders().then(setEncoders).catch(() => setEncoders(null));
  }, []);

  useEffect(() => {
    let current = true;
    const apply = (formats: string[]) => {
      if (!current) return;
      setCopyFormats(formats);
      const state = useForm.getState();
      if (state.sizeMode !== "copy") return;
      if (!formats.length) state.set({ sizeMode: "quality" });
      else if (!formats.includes(state.format)) state.set({ format: formats[0] as OutputFormat });
    };
    if (!form.files.length) apply([]);
    else api.media_convert.copyFormats(form.files).then(apply).catch(() => apply([]));
    return () => {
      current = false;
    };
  }, [form.files]);

  const selectSizeMode = (sizeMode: SizeMode) => {
    if (sizeMode === "copy" && !copyFormats.includes(form.format)) form.set({ sizeMode, format: copyFormats[0] as OutputFormat });
    else form.set({ sizeMode });
  };

  const loadFrames = useFrameLoader(api.media_convert.frames, info?.hasVideo ? single : null);

  const acceptFiles = useAcceptFiles(MEDIA_EXTENSIONS);
  const addFiles = (paths: string[]) => {
    const accepted = acceptFiles(paths);
    if (accepted.length) form.set({ files: addUnique(useForm.getState().files, accepted), range: null });
  };
  const browse = async () =>
    addFiles(await api.dialogs.openFiles([dialogFilter(t, "videos", MEDIA_EXTENSIONS)]));

  useIncomingTransfer("media_convert", addFiles);

  const canStart = form.files.length > 0 && !!outputDir && !runner.running;
  const idleText = form.files.length ? t("common.idle.filesReady", { count: form.files.length }) : t("common.idle.pickFiles");

  const start = () =>
    runner
      .start(() =>
        api.media_convert.start({
          paths: form.files,
          outputDir,
          format: form.format,
          codec,
          copy,
          quality: form.quality,
          targetMb: video && form.sizeMode === "size" ? form.targetMb : 0,
          height: Number(form.height),
          mute: form.mute,
          audioKbps: Number(form.audioKbps),
          normalize: form.normalize && !copy,
          start: single && form.range && !copy ? form.range.start : 0,
          end: single && form.range && !copy ? form.range.end : 0,
        }),
      )
      .catch((err) => notify.error(t("media_convert.toast.error"), { body: errorMessage(t, err) }));

  useToolShortcuts({ run: canStart && start, open: browse });

  const formatChoices = useMemo<SelectOption<OutputFormat>[]>(() => {
    const videoChoices = formatOptions(VIDEO_FORMATS).map((o) => ({ ...o, keywords: t("media_convert.video") }));
    if (copy) return videoChoices.filter((o) => copyFormats.includes(o.value));
    return [
      ...videoChoices,
      ...formatOptions(AUDIO_FORMATS).map((o) => ({ ...o, label: `${o.label} · ${t("media_convert.audioOnly")}`, keywords: t("media_convert.audio") })),
    ];
  }, [t, copy, copyFormats]);
  const codecChoices = codecs.map((value) => ({ value, label: CODEC_LABELS[value] }));
  const qualityChoices = QUALITIES.map((value) => ({ value, label: t(`media_convert.quality.${value}`) }));
  const heightChoices = HEIGHTS.map((value) => ({ value, label: value === "0" ? t("media_convert.keepResolution") : `${value}p` }));
  const bitrateChoices = BITRATES.map((value) => ({ value, label: `${value} kb/s` }));

  const duration = info?.duration ?? 0;
  const range = form.range ?? { start: 0, end: duration };
  const result = runner.result;

  const outputPanel = (
    <Panel title={t("media_convert.output")}>
      <Field label={t("media_convert.format")}>
        <Select searchable options={formatChoices} value={form.format} onChange={(format) => form.set({ format })} />
      </Field>
      {video ? (
        <>
          <TabList size="small" selectedValue={form.sizeMode} onTabSelect={(_, d) => selectSizeMode(d.value as SizeMode)}>
            <Tab value="quality">{t("media_convert.byQuality")}</Tab>
            <Tab value="size">{t("media_convert.bySize")}</Tab>
            {copyFormats.length > 0 && <Tab value="copy">{t("media_convert.copyOnly")}</Tab>}
          </TabList>
          {!copy && (
            <Field label={t("media_convert.codec")}>
              <Select options={codecChoices} value={codec} onChange={(value) => form.set({ codec: value })} />
            </Field>
          )}
          {copy ? null : form.sizeMode === "quality" ? (
            <Field label={t("media_convert.qualityLabel")}>
              <Select options={qualityChoices} value={form.quality} onChange={(quality) => form.set({ quality })} />
            </Field>
          ) : (
            <Field label={t("media_convert.targetSize")} hint={form.files.length > 1 ? t("media_convert.targetSizeEach") : undefined}>
              <Input
                type="number"
                min={1}
                step={1}
                value={String(form.targetMb)}
                contentAfter="MB"
                onChange={(_, d) => form.set({ targetMb: Math.max(1, Number(d.value) || 1) })}
              />
            </Field>
          )}
          {!copy && (
            <Field label={t("media_convert.resolution")}>
              <Select options={heightChoices} value={form.height} onChange={(height) => form.set({ height })} />
            </Field>
          )}
          <Switch label={t("media_convert.mute")} checked={form.mute} onChange={(_, d) => form.set({ mute: d.checked })} />
        </>
      ) : (
        !LOSSLESS.has(form.format) && (
          <Field label={t("media_convert.bitrate")}>
            <Select options={bitrateChoices} value={form.audioKbps} onChange={(audioKbps) => form.set({ audioKbps })} />
          </Field>
        )
      )}
      {!(video && form.mute) && !copy && (
        <Switch
          label={t("media_convert.normalize")}
          checked={form.normalize}
          onChange={(_, d) => form.set({ normalize: d.checked })}
        />
      )}
      <OutputFolderField value={form.outputDir} onChange={(dir) => form.set({ outputDir: dir })} />
    </Panel>
  );

  return (
    <ToolPage toolId="media_convert">
      <Columns side={outputPanel}>
        <Panel title={t("media_convert.files")}>
          <DropZone
            compact={form.files.length > 0}
            title={t("media_convert.dropTitle")}
            hint={formatList(MEDIA_EXTENSIONS)}
            accept={MEDIA_EXTENSIONS}
            onFiles={addFiles}
            onBrowse={browse}
          />
          <FileList
            files={form.files}
            icon={video ? <Video16Regular /> : <MusicNote216Regular />}
            onChange={(files) => form.set({ files, range: null })}
            sourceToolId="media_convert"
          />
        </Panel>

        {single && duration > 0 && !copy && (
          <Panel
            title={t("media_convert.trim")}
            actions={
              form.range && (
                <Button size="small" appearance="subtle" onClick={() => form.set({ range: null })}>
                  {t("media_convert.wholeFile")}
                </Button>
              )
            }
          >
            <TrimTimeline
              duration={duration}
              frameAspect={info?.hasVideo && info.height > 0 ? info.width / info.height : 0}
              loadFrames={loadFrames}
              start={range.start}
              end={range.end}
              onChange={(start, end) => form.set({ range: { start, end } })}
              snap={0.01}
            />
            <TrimFields
              start={range.start}
              end={range.end}
              duration={duration}
              onChange={(start, end) => form.set({ range: { start, end } })}
            />
          </Panel>
        )}

        {result && result.converted > 0 && (
          <ResultCard
            title={t("media_convert.done", { count: result.converted })}
            path={result.outPath ?? result.outputDir}
            folder={!result.outPath}
            files={result.files}
            sourceToolId="media_convert"
            detail={`${formatBytes(result.inBytes)} → ${formatBytes(result.outBytes)}`}
          />
        )}
        {runner.job && runner.job.logs.length > 0 && <LogPanel logs={runner.job.logs} />}
      </Columns>

      <ActionBar job={runner.job} idleText={idleText} onCancel={runner.cancel}>
        <Button appearance="primary" icon={<Play16Filled />} disabled={!canStart} onClick={start}>
          {t("media_convert.start")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

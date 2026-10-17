import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  Field,
  makeStyles,
  Option,
  Spinner,
  tokens,
} from "@fluentui/react-components";
import { Play16Regular, Save16Regular, VideoSwitch20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { ResultCard } from "../../components/ResultCard";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { allFilesFilter, dialogFilter, VIDEO_EXTENSIONS } from "../../lib/fileTypes";
import { fileName } from "../../lib/format";
import type { VideoInfo, WaveformData } from "../../lib/types";
import { useJobRunner } from "../../lib/useJobRunner";
import { OFFSET_LIMIT_SEC, WaveformTimeline } from "./WaveformTimeline";

const WAVEFORM_POINTS = 4000;
const PREVIEW_LENGTHS = [10, 15, 30, 60];

type ExportMode = "fast_copy" | "reencode";
/** Index of an embedded audio track, or the external audio file. */
type AudioSource = number | "external";

interface ExportResult {
  outputPath: string;
  fileName: string;
  bytes: number;
  offsetSec: number;
}

const useStyles = makeStyles({
  player: {
    display: "block",
    width: "100%",
    maxHeight: "360px",
    aspectRatio: "16 / 9",
    objectFit: "contain",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  row: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" },
  offset: { flexBasis: "100%" },
  source: { minWidth: "260px" },
  length: { width: "120px" },
  output: { flex: "1 1 320px", minWidth: 0 },
  mode: { minWidth: "240px" },
});

const errorText = (err: unknown) => String((err as Error)?.message ?? err);

export default function VideoSyncPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const tool = toolById("video_sync")!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const framesErrorFor = useRef<string | null>(null);

  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [trackWave, setTrackWave] = useState<WaveformData | null>(null);
  const [externalAudio, setExternalAudio] = useState<VideoInfo | null>(null);
  const [externalWave, setExternalWave] = useState<WaveformData | null>(null);
  const [source, setSource] = useState<AudioSource>(0);
  const [trackIndex, setTrackIndex] = useState(0);
  const [offsetSec, setOffsetSec] = useState(0);
  const [previewStartSec, setPreviewStartSec] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(30);
  const [previewClip, setPreviewClip] = useState<{ url: string; startSec: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [playheadSec, setPlayheadSec] = useState<number | null>(null);
  const [outputPath, setOutputPath] = useState("");
  const [exportMode, setExportMode] = useState<ExportMode>("fast_copy");

  const runner = useJobRunner<ExportResult>("video_sync", {
    onError: (err) => notify.error(t("video_sync.export.error"), { body: err }),
  });

  const external = source === "external" ? externalAudio : null;
  const trackStreamIndex = video?.audioTracks[trackIndex]?.streamIndex;

  useEffect(() => {
    setTrackWave(null);
    if (!video?.hasAudio) return;
    let current = true;
    api.video_sync
      .waveform(video.path, WAVEFORM_POINTS, 0, undefined, trackStreamIndex)
      .then((wave) => current && setTrackWave(wave))
      .catch((err) => notify.error(t("video_sync.errors.loadVideo"), { body: errorText(err) }));
    return () => {
      current = false;
    };
  }, [video, trackStreamIndex, notify, t]);

  useEffect(() => {
    if (previewClip) videoRef.current?.play().catch(() => undefined);
  }, [previewClip]);

  const loadVideo = async (path: string) => {
    try {
      const meta = await api.video_sync.probe(path);
      setVideo(meta);
      setSource(0);
      setTrackIndex(0);
      setOffsetSec(0);
      setPreviewStartSec(0);
      setPreviewClip(null);
      setPlayheadSec(null);
      setOutputPath(`${path.replace(/\.[^.\\/]+$/, "")}_synced.mp4`);
      runner.reset();
    } catch (err) {
      notify.error(t("video_sync.errors.loadVideo"), { body: errorText(err) });
    }
  };

  const browseVideo = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "videos"), allFilesFilter(t)], false);
    if (path) loadVideo(path);
  };

  const browseAudio = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "audio"), allFilesFilter(t)], false);
    if (!path) return;
    try {
      setExternalAudio(await api.video_sync.probe(path));
      setExternalWave(null);
      setSource("external");
      setExternalWave(await api.video_sync.waveform(path, WAVEFORM_POINTS));
    } catch (err) {
      notify.error(t("video_sync.errors.loadAudio"), { body: errorText(err) });
    }
  };

  // An external file is a single-stream input, so its audio index is always 0.
  const audioParams = () =>
    external ? { audioPath: external.path, audioTrackIndex: 0 } : { audioPath: undefined, audioTrackIndex: trackIndex };

  const generatePreview = async () => {
    if (!video) return;
    setPreviewing(true);
    try {
      const res = await api.video_sync.preview({
        videoPath: video.path,
        offsetSec,
        startSec: previewStartSec,
        duration: previewDuration,
        ...audioParams(),
      });
      setPreviewClip({ url: res.previewUrl, startSec: previewStartSec });
    } catch (err) {
      notify.error(t("video_sync.errors.preview"), { body: errorText(err) });
    } finally {
      setPreviewing(false);
    }
  };

  const startExport = () => {
    if (!video || !outputPath) return;
    runner.start(() =>
      api.video_sync.start({ videoPath: video.path, offsetSec, outputPath, mode: exportMode, ...audioParams() }),
    );
  };

  // The timeline refetches frames on every scroll/zoom, so report a failure once per video.
  const loadFrames = useCallback(
    (startSec: number, length: number, count: number, height: number) => {
      const path = video!.path;
      return api.video_sync
        .frames(path, startSec, length, count, height)
        .then((r) => r.frames)
        .catch((err) => {
          if (framesErrorFor.current !== path) {
            framesErrorFor.current = path;
            notify.error(t("video_sync.errors.frames"), { body: errorText(err) });
          }
          return [];
        });
    },
    [video, notify, t],
  );

  const trackLabel = (index: number) => {
    const track = video?.audioTracks[index];
    if (!track) return "";
    return [track.title || t("video_sync.trackNum", { num: index + 1 }), track.codec.toUpperCase(), `${track.channels} ch`].join(" · ");
  };
  const sourceLabel = source === "external" ? (externalAudio ? fileName(externalAudio.path) : "") : trackLabel(source);

  const modeLabel: Record<ExportMode, string> = {
    fast_copy: t("video_sync.export.fastCopy"),
    reencode: t("video_sync.export.reencode"),
  };

  if (!video) {
    return (
      <Page title={t("tools.video_sync.name")} description={t("tools.video_sync.description")} icon={tool.icon} accent={tool.accent}>
        <DropZone
          icon={VideoSwitch20Regular}
          title={t("video_sync.dropTitle")}
          hint={t("video_sync.dropHint")}
          accept={VIDEO_EXTENSIONS}
          onFiles={(files) => files[0] && loadVideo(files[0])}
          onBrowse={browseVideo}
        />
      </Page>
    );
  }

  return (
    <Page title={t("tools.video_sync.name")} description={t("tools.video_sync.description")} icon={tool.icon} accent={tool.accent}>
      <Panel
        title={video.fileName}
        actions={
          <Button appearance="subtle" icon={<VideoSwitch20Regular />} onClick={browseVideo}>
            {t("video_sync.changeVideo")}
          </Button>
        }
      >
        <video
          ref={videoRef}
          className={styles.player}
          src={previewClip?.url}
          poster={video.thumbnail || undefined}
          controls={!!previewClip}
          loop
          onTimeUpdate={(e) => previewClip && setPlayheadSec(previewClip.startSec + e.currentTarget.currentTime)}
        />

        <WaveformTimeline
          duration={video.duration}
          frameAspect={video.hasVideo && video.height > 0 ? video.width / video.height : 0}
          loadFrames={loadFrames}
          reference={external ? trackWave : null}
          shifted={external ? externalWave : trackWave}
          shiftedDuration={external ? external.duration : video.duration}
          offsetSec={offsetSec}
          onOffsetChange={setOffsetSec}
          playheadSec={playheadSec}
          previewStartSec={previewStartSec}
          previewDuration={previewDuration}
          onPreviewStartChange={setPreviewStartSec}
        />

        <div className={styles.row}>
          <div className={styles.offset}>
            <SliderField
              label={t("video_sync.offset")}
              value={Math.round(offsetSec * 1000)}
              min={-OFFSET_LIMIT_SEC * 1000}
              max={OFFSET_LIMIT_SEC * 1000}
              format={(ms) => `${ms > 0 ? "+" : ""}${ms} ms`}
              onChange={(ms) => setOffsetSec(ms / 1000)}
            />
          </div>

          <Field label={t("video_sync.audioSource")} className={styles.source}>
            <Dropdown
              value={sourceLabel}
              selectedOptions={[String(source)]}
              onOptionSelect={(_, d) => {
                if (d.optionValue === "pick") browseAudio();
                else if (d.optionValue === "external") setSource("external");
                else {
                  setSource(Number(d.optionValue));
                  setTrackIndex(Number(d.optionValue));
                }
              }}
            >
              {video.audioTracks.map((_, i) => (
                <Option key={i} value={String(i)}>
                  {trackLabel(i)}
                </Option>
              ))}
              {externalAudio && <Option value="external">{fileName(externalAudio.path)}</Option>}
              <Option value="pick">{t("video_sync.pickAudio")}</Option>
            </Dropdown>
          </Field>

          <Field label={t("video_sync.previewLength")} className={styles.length}>
            <Dropdown
              value={`${previewDuration} s`}
              selectedOptions={[String(previewDuration)]}
              onOptionSelect={(_, d) => setPreviewDuration(Number(d.optionValue))}
            >
              {PREVIEW_LENGTHS.map((len) => (
                <Option key={len} value={String(len)}>{`${len} s`}</Option>
              ))}
            </Dropdown>
          </Field>

          <Button icon={previewing ? <Spinner size="tiny" /> : <Play16Regular />} disabled={previewing} onClick={generatePreview}>
            {t("video_sync.preview")}
          </Button>
        </div>

        <div className={styles.row}>
          <Field label={t("video_sync.output")} className={styles.output}>
            <PathPicker
              mode="save"
              value={outputPath}
              onChange={setOutputPath}
              defaultFileName={fileName(outputPath)}
              fileTypes={[dialogFilter(t, "videos", [".mp4"])]}
            />
          </Field>
          <Field label={t("video_sync.export.mode")} className={styles.mode}>
            <Dropdown
              value={modeLabel[exportMode]}
              selectedOptions={[exportMode]}
              onOptionSelect={(_, d) => setExportMode(d.optionValue as ExportMode)}
            >
              <Option value="fast_copy">{modeLabel.fast_copy}</Option>
              <Option value="reencode">{modeLabel.reencode}</Option>
            </Dropdown>
          </Field>
        </div>

        {runner.result && (
          <ResultCard title={t("video_sync.export.success")} path={runner.result.outputPath} sourceToolId="video_sync" />
        )}
      </Panel>

      <ActionBar job={runner.job?.status === "done" ? undefined : runner.job} onCancel={runner.cancel}>
        <Button appearance="primary" icon={<Save16Regular />} disabled={!outputPath || runner.running} onClick={startExport}>
          {t("video_sync.export.action")}
        </Button>
      </ActionBar>
    </Page>
  );
}

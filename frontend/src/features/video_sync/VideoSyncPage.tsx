import { useCallback, useState } from "react";
import {
  Button,
  Caption1,
  makeStyles,
  ProgressBar,
  Radio,
  RadioGroup,
  Subtitle2,
  tokens,
} from "@fluentui/react-components";
import {
  Delete16Regular,
  FolderOpen16Regular,
  Save16Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { DropZone } from "../../components/DropZone";
import { jobMessage } from "../../components/JobStatusBadge";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { api } from "../../lib/bridge";
import { fileName } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import type { AudioSourceMode } from "./types";
import type { VideoInfo, WaveformData } from "../../lib/types";
import { OffsetControls } from "./OffsetControls";
import { VideoPreviewCard } from "./VideoPreviewCard";
import { WaveformTimeline } from "./WaveformTimeline";

const SUPPORTED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".webm",
  ".flv",
  ".wmv",
  ".ts",
  ".m4v",
];

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    height: "100%",
  },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: "14px",
    alignItems: "start",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "1fr",
    },
  },
  exportCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "16px",
  },
  exportRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  outPathBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    flexGrow: 1,
    minWidth: "220px",
  },
  jobProgress: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "8px",
  },
});

export default function VideoSyncPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const tool = toolById("video_sync");

  // State
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [videoWaveform, setVideoWaveform] = useState<WaveformData | null>(null);

  const [externalAudio, setExternalAudio] = useState<VideoInfo | null>(null);
  const [externalWaveform, setExternalWaveform] = useState<WaveformData | null>(null);
  const [audioSourceMode, setAudioSourceMode] = useState<AudioSourceMode>("embedded");
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number>(0);

  // Offset in seconds (positive = delay audio, negative = audio lead)
  const [offsetSec, setOffsetSec] = useState<number>(0);

  // Preview state
  const [previewStartSec, setPreviewStartSec] = useState<number>(0);
  const [previewDuration, setPreviewDuration] = useState<number>(30); // 30s as requested by user
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  const [playheadSec, setPlayheadSec] = useState<number>(0);

  // Export state
  const [outputPath, setOutputPath] = useState<string>("");
  const [exportMode, setExportMode] = useState<"fast_copy" | "reencode">("fast_copy");
  const exportContainer = "mp4";

  // Job Runner for background export
  const runner = useJobRunner("video_sync", {
    onDone: (result: any) => {
      notify.success(t("video_sync.export.success", "Wideo wyeksportowane pomyślnie!"), {
        body: result?.fileName || "",
      });
    },
    onError: (err) => {
      notify.error(t("video_sync.export.error", "Błąd podczas eksportu"), {
        body: String(err),
      });
    },
  });

  // Load Video File
  const loadVideo = useCallback(
    async (path: string) => {
      setPreviewUrl(null);
      setOffsetSec(0);
      try {
        const meta = await api.video_sync.probe(path);
        setVideo(meta);
        setSelectedAudioTrackIndex(0);
        setPreviewStartSec(0);
        setPlayheadSec(0);

        // Compute default output path
        const dotIdx = path.lastIndexOf(".");
        const defOut =
          dotIdx > 0
            ? `${path.slice(0, dotIdx)}_synced.${exportContainer}`
            : `${path}_synced.${exportContainer}`;
        setOutputPath(defOut);

        // Load waveform
        if (meta.hasAudio) {
          api.video_sync
            .waveform(path, 1200)
            .then((wave) => setVideoWaveform(wave))
            .catch((e) => console.error("Could not load waveform", e));
        } else {
          setVideoWaveform(null);
        }
      } catch (err: any) {
        notify.error(t("video_sync.errors.loadVideo", "Błąd ładowania wideo"), {
          body: String(err?.message || err),
        });
      }
    },
    [exportContainer, notify],
  );

  // Load External Audio File
  const loadExternalAudio = useCallback(
    async (path: string) => {
      try {
        const meta = await api.video_sync.probe(path);
        setExternalAudio(meta);
        setAudioSourceMode("external");
        api.video_sync
          .waveform(path, 1200)
          .then((wave) => setExternalWaveform(wave))
          .catch((e) => console.error("Could not load external waveform", e));
      } catch (err: any) {
        notify.error(t("video_sync.errors.loadAudio", "Błąd ładowania pliku audio"), {
          body: String(err?.message || err),
        });
      }
    },
    [notify],
  );

  // Native File Dialogs
  const handleBrowseVideo = async () => {
    const files = await api.dialogs.openFiles(
      ["Pliki wideo (*.mp4;*.mkv;*.mov;*.avi;*.webm;*.flv;*.wmv;*.ts)", "Wszystkie pliki (*.*)"],
      false,
    );
    if (files && files.length > 0) {
      loadVideo(files[0]);
    }
  };

  const handleBrowseAudio = async () => {
    const files = await api.dialogs.openFiles(
      ["Pliki audio (*.mp3;*.wav;*.aac;*.m4a;*.flac;*.ogg;*.opus)", "Wszystkie pliki (*.*)"],
      false,
    );
    if (files && files.length > 0) {
      loadExternalAudio(files[0]);
    }
  };

  const handleBrowseSaveLocation = async () => {
    if (!video) return;
    const saveLoc = await api.dialogs.saveFile(fileName(outputPath), [
      `${exportContainer.toUpperCase()} (*.${exportContainer})`,
      "Wszystkie pliki (*.*)",
    ]);
    if (saveLoc) {
      setOutputPath(saveLoc);
    }
  };

  // Generate Fast Preview
  const handleGeneratePreview = async () => {
    if (!video) return;
    setIsGeneratingPreview(true);
    try {
      const res = await api.video_sync.preview({
        videoPath: video.path,
        offsetSec,
        startSec: previewStartSec,
        duration: previewDuration,
        audioPath: audioSourceMode === "external" ? externalAudio?.path : undefined,
        audioTrackIndex: selectedAudioTrackIndex,
      });
      setPreviewUrl(res.previewUrl);
    } catch (err: any) {
      notify.error(t("video_sync.errors.preview", "Błąd generowania podglądu"), {
        body: String(err?.message || err),
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Start Full Export
  const handleStartExport = () => {
    if (!video || !outputPath) return;
    runner.start(() =>
      api.video_sync.start({
        videoPath: video.path,
        audioPath: audioSourceMode === "external" ? externalAudio?.path : undefined,
        audioTrackIndex: selectedAudioTrackIndex,
        offsetSec,
        outputPath,
        mode: exportMode,
      }),
    );
  };

  // Reset Everything
  const handleReset = () => {
    setVideo(null);
    setVideoWaveform(null);
    setExternalAudio(null);
    setExternalWaveform(null);
    setOffsetSec(0);
    setPreviewUrl(null);
    setOutputPath("");
  };

  const actions = video ? (
    <>
      <Button icon={<Delete16Regular />} appearance="subtle" onClick={handleReset}>
        {t("video_sync.changeVideo", "Zmień wideo")}
      </Button>
      <Button
        icon={<Save16Regular />}
        appearance="primary"
        disabled={runner.running || !outputPath}
        onClick={handleStartExport}
      >
        {runner.running
          ? t("video_sync.status.syncing", "Eksportowanie...")
          : t("video_sync.export.startExport", "Eksportuj zsynchronizowane wideo")}
      </Button>
    </>
  ) : undefined;

  return (
    <Page
      title={t("video_sync.title", "Synchronizacja Audio-Wideo")}
      description={t(
        "video_sync.subtitle",
        "Wyrównuj rozjechane ścieżki dźwiękowe z obrazem, dopasowuj po amplitudzie i twórz podgląd",
      )}
      icon={tool?.icon}
      accent={tool?.accent}
      actions={actions}
    >
      <div className={styles.container}>
        {!video ? (
          <DropZone
            title={t("video_sync.dropTitle", "Upuść plik wideo tutaj lub kliknij, aby wybrać")}
            hint={t(
              "video_sync.dropHint",
              "Obsługuje MP4, MKV, MOV, AVI, WEBM, FLV, WMV i inne formaty wideo",
            )}
            accept={SUPPORTED_VIDEO_EXTENSIONS}
            onFiles={(files) => files.length > 0 && loadVideo(files[0])}
            onBrowse={handleBrowseVideo}
            icon={Video24Regular}
          />
        ) : (
          <>
            {/* Top Row: Video Player + Offset Controls */}
            <div className={styles.topGrid}>
              <VideoPreviewCard
                video={video}
                previewUrl={previewUrl}
                isGenerating={isGeneratingPreview}
                previewStartSec={previewStartSec}
                onPreviewStartSecChange={setPreviewStartSec}
                previewDuration={previewDuration}
                onPreviewDurationChange={setPreviewDuration}
                onGeneratePreview={handleGeneratePreview}
                onCurrentTimeChange={setPlayheadSec}
              />

              <OffsetControls
                offsetSec={offsetSec}
                onOffsetChange={setOffsetSec}
                video={video}
                selectedAudioTrackIndex={selectedAudioTrackIndex}
                onAudioTrackChange={setSelectedAudioTrackIndex}
                audioSourceMode={audioSourceMode}
                onAudioSourceModeChange={setAudioSourceMode}
                externalAudio={externalAudio}
                onPickExternalAudio={handleBrowseAudio}
              />
            </div>

            {/* Bottom Row: Full Studio Waveform Timeline */}
            <WaveformTimeline
              video={video}
              videoWaveform={videoWaveform}
              externalAudio={externalAudio}
              externalWaveform={externalWaveform}
              offsetSec={offsetSec}
              onOffsetChange={setOffsetSec}
              playheadSec={playheadSec}
              previewStartSec={previewStartSec}
              previewDuration={previewDuration}
              onSeek={(sec) => {
                setPlayheadSec(sec);
                setPreviewStartSec(Math.min(sec, Math.max(0, video.duration - previewDuration)));
              }}
            />

            {/* Export & Output Config Card */}
            <div className={styles.exportCard}>
              <Subtitle2>{t("video_sync.export.title", "Eksport zsynchronizowanego wideo")}</Subtitle2>

              <div className={styles.exportRow}>
                {/* Mode Selector */}
                <RadioGroup
                  layout="horizontal"
                  value={exportMode}
                  onChange={(_, d) => setExportMode(d.value as any)}
                >
                  <Radio
                    value="fast_copy"
                    label={t(
                      "video_sync.export.fastCopy",
                      "Szybki bezstratny (Kopiowanie strumienia wideo - natychmiastowe)",
                    )}
                  />
                  <Radio
                    value="reencode"
                    label={t("video_sync.export.reencode", "Pełne przekodowanie (Wysoka jakość x264/AAC)")}
                  />
                </RadioGroup>

                {/* Output File Path */}
                <div className={styles.outPathBox}>
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                    {t("video_sync.export.saveAs", "Zapisz jako:")}
                  </Caption1>
                  <Caption1
                    style={{
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flexGrow: 1,
                    }}
                  >
                    {outputPath}
                  </Caption1>
                  <Button size="small" icon={<FolderOpen16Regular />} onClick={handleBrowseSaveLocation}>
                    {t("video_sync.export.browse", "Przeglądaj")}
                  </Button>
                </div>

                <Button
                  appearance="primary"
                  icon={<Save16Regular />}
                  disabled={runner.running || !outputPath}
                  onClick={handleStartExport}
                >
                  {runner.running
                    ? t("video_sync.status.syncing", "Eksportowanie...")
                    : t("video_sync.export.startExport", "Eksportuj zsynchronizowane wideo")}
                </Button>
              </div>

              {/* Progress feedback when job is running */}
              {runner.running && (
                <div className={styles.jobProgress}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Caption1>{(runner.job && jobMessage(t, runner.job)) || t("video_sync.status.syncing", "Eksportowanie wideo...")}</Caption1>
                    <Caption1>{runner.job?.percent != null ? `${Math.round(runner.job.percent)}%` : ""}</Caption1>
                  </div>
                  <ProgressBar value={runner.job?.percent != null ? runner.job.percent / 100 : undefined} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

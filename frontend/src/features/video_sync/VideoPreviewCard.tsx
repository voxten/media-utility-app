import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  makeStyles,
  Spinner,
  Subtitle2,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowLeft16Regular,
  ArrowRight16Regular,
  ArrowReset24Regular,
  Sparkle16Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { formatDuration } from "../../lib/format";
import type { VideoInfo } from "../../lib/types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "16px",
  },
  playerWrapper: {
    position: "relative",
    width: "100%",
    minHeight: "260px",
    maxHeight: "420px",
    aspectRatio: "16/9",
    backgroundColor: "#000",
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  videoElement: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    color: tokens.colorNeutralForeground4,
    textAlign: "center",
    padding: "20px",
  },
  previewSettings: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  durationButtons: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  metaBadges: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },

  // Custom Scrubber Styling with prominent track line & handle
  scrubberContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingTop: "4px",
  },
  scrubberHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackArea: {
    position: "relative",
    height: "32px",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    userSelect: "none",
  },
  // Clearly visible solid track line with high contrast border
  trackRail: {
    position: "absolute",
    left: "0",
    right: "0",
    height: "8px",
    borderRadius: "4px",
    backgroundColor: "#272a33",
    border: "1.5px solid rgba(255, 255, 255, 0.22)",
    boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.5)",
  },
  // Highlighted preview window slice (e.g. 30s portion)
  trackPreviewWindow: {
    position: "absolute",
    height: "10px",
    borderRadius: "5px",
    background: "linear-gradient(90deg, #06b6d4, #10b981)",
    boxShadow: "0 0 10px rgba(6, 182, 212, 0.6)",
    pointerEvents: "none",
    transitionProperty: "left, width",
    transitionDuration: "60ms",
  },
  // Prominent glowing draggable handle
  trackThumb: {
    position: "absolute",
    top: "50%",
    width: "22px",
    height: "22px",
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    border: "3px solid #06b6d4",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.6), 0 0 12px rgba(6, 182, 212, 0.7)",
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    transitionProperty: "transform, box-shadow",
    transitionDuration: tokens.durationFast,
    ":hover": {
      transform: "translate(-50%, -50%) scale(1.15)",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.8), 0 0 16px rgba(6, 182, 212, 0.9)",
    },
    ":active": {
      cursor: "grabbing",
      transform: "translate(-50%, -50%) scale(1.1)",
    },
  },
  thumbGrip: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#06b6d4",
  },
  scrubberFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
  },
  nudgeButtonsRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
});

interface VideoPreviewCardProps {
  video: VideoInfo;
  previewUrl: string | null;
  isGenerating: boolean;
  previewStartSec: number;
  onPreviewStartSecChange: (start: number) => void;
  previewDuration: number;
  onPreviewDurationChange: (dur: number) => void;
  onGeneratePreview: () => void;
  onCurrentTimeChange?: (time: number) => void;
}

export function VideoPreviewCard({
  video,
  previewUrl,
  isGenerating,
  previewStartSec,
  onPreviewStartSecChange,
  previewDuration,
  onPreviewDurationChange,
  onGeneratePreview,
  onCurrentTimeChange,
}: VideoPreviewCardProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackAreaRef = useRef<HTMLDivElement | null>(null);
  const [loop, setLoop] = useState<boolean>(true);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // When preview URL updates, load and auto-play
  useEffect(() => {
    if (videoRef.current && previewUrl) {
      videoRef.current.load();
      videoRef.current.play().catch(() => undefined);
    }
  }, [previewUrl]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      onCurrentTimeChange?.(previewStartSec + videoRef.current.currentTime);
    }
  };

  const totalDuration = Math.max(1, video.duration);
  const maxStart = Math.max(0, totalDuration - previewDuration);

  // Position calculations
  const thumbPercent = maxStart > 0 ? (previewStartSec / totalDuration) * 100 : 0;
  const windowWidthPercent = Math.min(
    100 - thumbPercent,
    Math.max(2, (previewDuration / totalDuration) * 100),
  );

  // Drag scrubber interaction
  const updateScrubberFromClientX = useCallback(
    (clientX: number) => {
      const el = trackAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clickRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetSec = Math.round(clickRatio * totalDuration);
      const clamped = Math.max(0, Math.min(maxStart, targetSec));
      onPreviewStartSecChange(clamped);
    },
    [maxStart, onPreviewStartSecChange, totalDuration],
  );

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    updateScrubberFromClientX(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      updateScrubberFromClientX(moveEvent.clientX);
    };

    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleNudgeStart = (deltaSec: number) => {
    const newStart = Math.max(0, Math.min(maxStart, previewStartSec + deltaSec));
    onPreviewStartSecChange(newStart);
  };

  const durationStr = formatDuration(video.duration);
  const startStr = formatDuration(previewStartSec);
  const endWindowStr = formatDuration(Math.min(totalDuration, previewStartSec + previewDuration));

  return (
    <div className={styles.container}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <Subtitle2>{t("video_sync.preview.title", "Odtwarzacz & Szybki Podgląd")}</Subtitle2>
        <div className={styles.metaBadges}>
          <Badge appearance="tint" color="brand">
            {video.width}×{video.height}
          </Badge>
          <Badge appearance="tint" color="informative">
            {video.fps} FPS
          </Badge>
          <Badge appearance="tint" color="subtle">
            {video.videoCodec.toUpperCase()}
          </Badge>
          <Badge appearance="tint" color="subtle">
            {durationStr}
          </Badge>
        </div>
      </div>

      {/* Video Element Wrapper */}
      <div className={styles.playerWrapper}>
        {previewUrl ? (
          <video
            ref={videoRef}
            src={previewUrl}
            className={styles.videoElement}
            controls
            loop={loop}
            onTimeUpdate={handleTimeUpdate}
          />
        ) : (
          <div className={styles.placeholder}>
            {video.thumbnail ? (
              <img
                src={video.thumbnail}
                alt="Thumbnail"
                style={{ maxWidth: "320px", maxHeight: "180px", borderRadius: "6px", objectFit: "cover" }}
              />
            ) : (
              <Video24Regular fontSize={40} color={tokens.colorBrandForeground1} />
            )}
            <Caption1>
              {t(
                "video_sync.preview.noClipPrompt",
                "Kliknij 'Wygeneruj podgląd', aby zobaczyć zsynchronizowany fragment wideo z naniesionym opóźnieniem dźwięku.",
              )}
            </Caption1>
          </div>
        )}
      </div>

      {/* Preview Generation Config */}
      <div className={styles.previewSettings}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <Caption1 style={{ fontWeight: 600 }}>
              {t("video_sync.preview.startPos", "Miejsce podglądu w filmie:")}{" "}
              <span style={{ color: "#06b6d4" }}>
                {startStr} – {endWindowStr}
              </span>
            </Caption1>
            <Caption1 style={{ color: tokens.colorNeutralForeground3, display: "block" }}>
              {t("video_sync.preview.startDesc", "Możesz wybrać dowolny fragment nawet w 3-godzinnym filmie")}
            </Caption1>
          </div>

          <div className={styles.durationButtons}>
            <Caption1 style={{ color: tokens.colorNeutralForeground3, marginRight: "4px" }}>
              {t("video_sync.preview.length", "Długość:")}
            </Caption1>
            {[10, 15, 30, 60].map((d) => (
              <Button
                key={d}
                size="small"
                appearance={previewDuration === d ? "primary" : "secondary"}
                onClick={() => onPreviewDurationChange(d)}
              >
                {d}s
              </Button>
            ))}
          </div>
        </div>

        {/* Custom High-Contrast Scrubber Line with Highlighted Preview Window */}
        <div className={styles.scrubberContainer}>
          <div
            ref={trackAreaRef}
            className={styles.trackArea}
            onMouseDown={handleTrackMouseDown}
            style={{ cursor: isScrubbing ? "grabbing" : "pointer" }}
          >
            {/* The visible base rail line */}
            <div className={styles.trackRail} />

            {/* The highlighted preview window (e.g. 30s) */}
            <div
              className={styles.trackPreviewWindow}
              style={{
                left: `${thumbPercent}%`,
                width: `${windowWidthPercent}%`,
              }}
            />

            {/* Draggable handle with glowing ring */}
            <Tooltip
              content={`${t("video_sync.preview.startPosTooltip", "Początek podglądu:")} ${startStr}`}
              relationship="label"
            >
              <div
                className={styles.trackThumb}
                style={{
                  left: `${thumbPercent}%`,
                }}
              >
                <div className={styles.thumbGrip} />
              </div>
            </Tooltip>
          </div>

          {/* Time markers below the line */}
          <div className={styles.scrubberFooter}>
            <span>00:00:00</span>
            <div className={styles.nudgeButtonsRow}>
              <Tooltip content={t("video_sync.preview.sub30s", "-30 sekund")} relationship="label">
                <Button size="small" appearance="subtle" icon={<ArrowLeft16Regular />} onClick={() => handleNudgeStart(-30)}>
                  -30s
                </Button>
              </Tooltip>
              <Tooltip content={t("video_sync.preview.startOfVideo", "00:00 (Początek filmu)")} relationship="label">
                <Button size="small" appearance="subtle" icon={<ArrowReset24Regular />} onClick={() => onPreviewStartSecChange(0)}>
                  00:00
                </Button>
              </Tooltip>
              <Tooltip content={t("video_sync.preview.add30s", "+30 sekund")} relationship="label">
                <Button size="small" appearance="subtle" icon={<ArrowRight16Regular />} onClick={() => handleNudgeStart(30)}>
                  +30s
                </Button>
              </Tooltip>
            </div>
            <span>{durationStr}</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => setLoop((l) => !l)}
            style={{ color: loop ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground3 }}
          >
            {loop
              ? t("video_sync.preview.loopOn", "✓ Pętla (Loop) włączona")
              : t("video_sync.preview.loopOff", "Pętla (Loop) wyłączona")}
          </Button>

          <Button
            appearance="primary"
            icon={isGenerating ? <Spinner size="tiny" /> : <Sparkle16Regular />}
            disabled={isGenerating}
            onClick={onGeneratePreview}
          >
            {isGenerating
              ? t("video_sync.preview.generating", "Generowanie podglądu...")
              : `${t("video_sync.preview.generateBtn", "Wygeneruj podgląd")} (${previewDuration}s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

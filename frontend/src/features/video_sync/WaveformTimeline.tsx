import { useCallback, useEffect, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import {
  Badge,
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowReset24Regular,
  Speaker224Regular,
  ZoomIn16Regular,
  ZoomOut16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { VideoInfo, WaveformData } from "../../lib/types";

const TRACK_HEIGHT = 80;
const RULER_HEIGHT = 26;

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    position: "relative",
    userSelect: "none",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  zoomBar: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  timelineScroll: {
    overflowX: "auto",
    overflowY: "hidden",
    position: "relative",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    cursor: "grab",
    ":active": {
      cursor: "grabbing",
    },
  },
  dragging: {
    cursor: "grabbing !important",
  },
  trackLabels: {
    position: "absolute",
    left: "0",
    top: `${RULER_HEIGHT}px`,
    width: "120px",
    display: "flex",
    flexDirection: "column",
    zIndex: 10,
    pointerEvents: "none",
  },
  trackLabel: {
    height: `${TRACK_HEIGHT}px`,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    paddingLeft: "10px",
    backgroundColor: "rgba(20, 20, 20, 0.75)",
    backdropFilter: "blur(6px)",
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: "12px",
    fontWeight: 600,
  },
  canvas: {
    display: "block",
  },
  dragOverlayTooltip: {
    position: "absolute",
    top: "8px",
    right: "12px",
    zIndex: 20,
    backgroundColor: tokens.colorBrandBackground,
    color: "#fff",
    padding: "4px 10px",
    borderRadius: tokens.borderRadiusMedium,
    fontSize: "12px",
    fontWeight: 600,
    boxShadow: tokens.shadow8,
    pointerEvents: "none",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    paddingTop: "4px",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  legendBox: {
    width: "12px",
    height: "12px",
    borderRadius: "2px",
  },
});

interface WaveformTimelineProps {
  video: VideoInfo;
  videoWaveform: WaveformData | null;
  externalAudio?: VideoInfo | null;
  externalWaveform?: WaveformData | null;
  offsetSec: number;
  onOffsetChange: (offset: number) => void;
  playheadSec?: number;
  onSeek?: (sec: number) => void;
  previewStartSec?: number;
  previewDuration?: number;
}

export function WaveformTimeline({
  video,
  videoWaveform,
  externalAudio,
  externalWaveform,
  offsetSec,
  onOffsetChange,
  playheadSec = 0,
  onSeek,
  previewStartSec = 0,
  previewDuration = 30,
}: WaveformTimelineProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Zoom level: 1x to 10x
  const [zoom, setZoom] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartX = useRef<number>(0);
  const dragStartOffset = useRef<number>(0);
  const [dragCurrentDelta, setDragCurrentDelta] = useState<number | null>(null);

  const duration = Math.max(1, video.duration);
  const trackCount = externalAudio ? 2 : 1;
  const totalHeight = RULER_HEIGHT + trackCount * TRACK_HEIGHT;

  // Base width per second of timeline
  // At zoom=1, we fit duration in standard view or minimum 1200px
  const basePxPerSec = Math.max(20, (1200 / duration)) * zoom;
  const totalWidth = Math.max(1200, Math.ceil(duration * basePxPerSec) + 200);

  // Handle Dragging
  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // If clicking inside track area, start dragging track offset
      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      if (clickY < RULER_HEIGHT) {
        // Clicking ruler -> seek
        const clickX = e.clientX - rect.left + (scrollContainerRef.current?.scrollLeft || 0);
        const seekTime = Math.max(0, Math.min(duration, clickX / basePxPerSec));
        onSeek?.(seekTime);
        return;
      }

      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartOffset.current = offsetSec;
      setDragCurrentDelta(0);
    },
    [basePxPerSec, duration, offsetSec, onSeek],
  );

  const handleMouseMove = useCallback(
    (e: globalThis.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX.current;
      // If holding shift, 5x fine precision
      const sensitivity = e.shiftKey ? 0.2 : 1.0;
      const deltaSec = (dx / basePxPerSec) * sensitivity;
      const newOffset = dragStartOffset.current + deltaSec;
      // Limit offset within -60s .. +60s
      const clamped = Math.max(-60, Math.min(60, Math.round(newOffset * 1000) / 1000));
      setDragCurrentDelta(clamped - dragStartOffset.current);
      onOffsetChange(clamped);
    },
    [isDragging, basePxPerSec, onOffsetChange],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragCurrentDelta(null);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handle wheel zoom with Ctrl
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      setZoom((prev) => Math.max(0.5, Math.min(10, prev + dir * 0.5)));
    }
  };

  // Draw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#141416";
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // 1. Draw Time Ruler
    ctx.fillStyle = "#1e1e24";
    ctx.fillRect(0, 0, totalWidth, RULER_HEIGHT);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(totalWidth, RULER_HEIGHT);
    ctx.stroke();

    // Ruler markings: interval depends on pxPerSec
    let tickInterval = 1.0; // 1s
    if (basePxPerSec < 15) tickInterval = 10.0;
    else if (basePxPerSec < 35) tickInterval = 5.0;
    else if (basePxPerSec < 80) tickInterval = 2.0;
    else if (basePxPerSec > 250) tickInterval = 0.5;

    ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.textAlign = "center";

    const maxSec = duration + 5;
    for (let sec = 0; sec <= maxSec; sec += tickInterval) {
      const x = sec * basePxPerSec;
      if (x > totalWidth) break;

      // Major tick
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - 8);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();

      // Label (format mm:ss or ss.s)
      const mins = Math.floor(sec / 60);
      const secs = (sec % 60).toFixed(tickInterval < 1 ? 1 : 0);
      const label = mins > 0 ? `${mins}:${secs.padStart(tickInterval < 1 ? 4 : 2, "0")}` : `${secs}s`;
      ctx.fillText(label, x, RULER_HEIGHT - 12);

      // Minor sub-ticks
      const subTicks = 4;
      const subStep = tickInterval / subTicks;
      for (let s = 1; s < subTicks; s++) {
        const subX = (sec + s * subStep) * basePxPerSec;
        ctx.beginPath();
        ctx.moveTo(subX, RULER_HEIGHT - 4);
        ctx.lineTo(subX, RULER_HEIGHT);
        ctx.stroke();
      }
    }

    // 2. Draw Track 1: Video Audio Waveform (Shifted by offsetSec)
    const track1Y = RULER_HEIGHT;

    // Track background
    ctx.fillStyle = "#181a20";
    ctx.fillRect(0, track1Y, totalWidth, TRACK_HEIGHT);

    // Track divider
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, track1Y + TRACK_HEIGHT);
    ctx.lineTo(totalWidth, track1Y + TRACK_HEIGHT);
    ctx.stroke();

    // Center line
    const midY1 = track1Y + TRACK_HEIGHT / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.beginPath();
    ctx.moveTo(0, midY1);
    ctx.lineTo(totalWidth, midY1);
    ctx.stroke();

    // Render Audio Offset Indication
    const offsetPx = offsetSec * basePxPerSec;
    if (offsetSec > 0) {
      // Audio is delayed: hatched region showing silence delay
      ctx.fillStyle = "rgba(234, 179, 8, 0.15)";
      ctx.fillRect(0, track1Y, offsetPx, TRACK_HEIGHT);
      ctx.fillStyle = "rgba(234, 179, 8, 0.6)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      if (offsetPx > 50) {
        ctx.fillText(`+${offsetSec.toFixed(3)}s ${t("video_sync.timeline.silenceDelay", "(Cisza/Delay)")}`, 8, midY1 + 4);
      }
    } else if (offsetSec < 0) {
      // Audio is early/trimmed: red hatched region showing trimmed audio
      const trimWidth = Math.min(totalWidth, Math.abs(offsetPx));
      ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
      ctx.fillRect(0, track1Y, trimWidth, TRACK_HEIGHT);
      ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      if (trimWidth > 50) {
        ctx.fillText(`${offsetSec.toFixed(3)}s ${t("video_sync.timeline.trimmedStart", "(Przycięty początek)")}`, 8, midY1 + 4);
      }
    }

    // Draw Audio Waveform Bars
    if (videoWaveform && videoWaveform.points.length > 0) {
      const pts = videoWaveform.points;
      const numPts = pts.length;
      // Start position shifted by offset
      const startX = offsetPx;
      const waveformWidth = duration * basePxPerSec;
      const stepX = waveformWidth / numPts;
      const barWidth = Math.max(1.2, stepX * 0.85);
      const halfHeight = (TRACK_HEIGHT / 2) - 8;

      // Gradient for waveform peaks: Cyan to Emerald
      const grad = ctx.createLinearGradient(0, track1Y, 0, track1Y + TRACK_HEIGHT);
      grad.addColorStop(0, "#06b6d4"); // Cyan
      grad.addColorStop(0.5, "#10b981"); // Emerald
      grad.addColorStop(1, "#06b6d4");

      ctx.fillStyle = grad;

      for (let i = 0; i < numPts; i++) {
        const x = startX + i * stepX;
        if (x < -10 || x > totalWidth + 10) continue;

        const peak = pts[i];
        const barH = Math.max(2, peak * halfHeight);
        ctx.fillRect(x, midY1 - barH, barWidth, barH * 2);
      }
    } else {
      // Loading waveform placeholder lines
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("video_sync.timeline.generatingWaveform", "Generowanie podglądu fali dźwiękowej..."), totalWidth / 3, midY1 + 4);
    }

    // 3. Draw Track 2 if External Audio is Loaded
    if (externalAudio) {
      const track2Y = RULER_HEIGHT + TRACK_HEIGHT;
      ctx.fillStyle = "#15171d";
      ctx.fillRect(0, track2Y, totalWidth, TRACK_HEIGHT);

      const midY2 = track2Y + TRACK_HEIGHT / 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.moveTo(0, midY2);
      ctx.lineTo(totalWidth, midY2);
      ctx.stroke();

      if (externalWaveform && externalWaveform.points.length > 0) {
        const pts = externalWaveform.points;
        const numPts = pts.length;
        const extDur = externalAudio.duration || duration;
        const waveformWidth = extDur * basePxPerSec;
        const stepX = waveformWidth / numPts;
        const barWidth = Math.max(1.2, stepX * 0.85);
        const halfHeight = (TRACK_HEIGHT / 2) - 8;

        // Violet to Indigo gradient for external audio track
        const gradExt = ctx.createLinearGradient(0, track2Y, 0, track2Y + TRACK_HEIGHT);
        gradExt.addColorStop(0, "#8b5cf6");
        gradExt.addColorStop(0.5, "#a855f7");
        gradExt.addColorStop(1, "#8b5cf6");

        ctx.fillStyle = gradExt;
        for (let i = 0; i < numPts; i++) {
          const x = i * stepX;
          if (x < -10 || x > totalWidth + 10) continue;
          const peak = pts[i];
          const barH = Math.max(2, peak * halfHeight);
          ctx.fillRect(x, midY2 - barH, barWidth, barH * 2);
        }
      }
    }

    // 4. Draw Playhead Marker
    if (playheadSec >= 0) {
      const playheadX = playheadSec * basePxPerSec;
      ctx.strokeStyle = "#e0475b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, totalHeight);
      ctx.stroke();

      // Playhead triangle cap
      ctx.fillStyle = "#e0475b";
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX, 10);
      ctx.closePath();
      ctx.fill();
    }

    // 5. Draw Preview Slice Window & Start Marker
    if (previewDuration > 0 && previewStartSec >= 0) {
      const pStartX = previewStartSec * basePxPerSec;
      const pWidth = Math.min(totalWidth - pStartX, previewDuration * basePxPerSec);

      // Translucent cyan highlight across tracks
      ctx.fillStyle = "rgba(6, 182, 212, 0.16)";
      ctx.fillRect(pStartX, RULER_HEIGHT, pWidth, totalHeight - RULER_HEIGHT);

      // Vertical line at start of preview
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pStartX, 0);
      ctx.lineTo(pStartX, totalHeight);

      // End vertical line of preview window
      ctx.moveTo(pStartX + pWidth, RULER_HEIGHT);
      ctx.lineTo(pStartX + pWidth, totalHeight);
      ctx.stroke();

      // Top flag badge on the ruler indicating Preview Window
      ctx.fillStyle = "#06b6d4";
      const tagW = Math.max(70, Math.min(110, pWidth));
      const tagH = 18;
      ctx.fillRect(pStartX, 4, tagW, tagH);

      ctx.fillStyle = "#000000";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${t("video_sync.timeline.previewBadge", "Podgląd")} (${previewDuration}s)`, pStartX + tagW / 2, 16);
    }

    ctx.restore();
  }, [
    totalWidth,
    totalHeight,
    duration,
    basePxPerSec,
    offsetSec,
    videoWaveform,
    externalAudio,
    externalWaveform,
    playheadSec,
    previewStartSec,
    previewDuration,
    t,
  ]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Caption1 style={{ fontWeight: 600 }}>
            {t("video_sync.timeline.title", "Oś czasu & Amplituda dźwięku (Przeciągaj track, aby przesunąć)")}
          </Caption1>
          <Badge
            color={offsetSec === 0 ? "informative" : offsetSec > 0 ? "warning" : "danger"}
            appearance="tint"
          >
            {offsetSec === 0
              ? t("video_sync.offset.inSync", "Brak przesunięcia (0.000s)")
              : offsetSec > 0
                ? `Opóźnienie: +${offsetSec.toFixed(3)}s (+${Math.round(offsetSec * 1000)}ms)`
                : `Wyprzedzenie: ${offsetSec.toFixed(3)}s (${Math.round(offsetSec * 1000)}ms)`}
          </Badge>
        </div>

        <div className={styles.zoomBar}>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            {t("video_sync.timeline.zoom", "Zoom:")} {zoom}x
          </Caption1>
          <Tooltip content={t("video_sync.timeline.zoomOut", "Pomniejsz")} relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<ZoomOut16Regular />}
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
              disabled={zoom <= 0.5}
            />
          </Tooltip>
          <Tooltip content={t("video_sync.timeline.zoomIn", "Powiększ")} relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<ZoomIn16Regular />}
              onClick={() => setZoom((z) => Math.min(10, z + 0.5))}
              disabled={zoom >= 10}
            />
          </Tooltip>
          <Tooltip content={t("video_sync.offset.reset", "Zresetuj przesunięcie do 0")} relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowReset24Regular />}
              onClick={() => onOffsetChange(0)}
            >
              0.00s
            </Button>
          </Tooltip>
        </div>
      </div>

      {dragCurrentDelta !== null && (
        <div className={styles.dragOverlayTooltip}>
          {dragCurrentDelta >= 0 ? `+${dragCurrentDelta.toFixed(3)}s` : `${dragCurrentDelta.toFixed(3)}s`} (
          {Math.round(dragCurrentDelta * 1000)} ms)
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className={mergeClasses(styles.timelineScroll, isDragging && styles.dragging)}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <div className={styles.trackLabels}>
          <div className={styles.trackLabel}>
            <Speaker224Regular fontSize={16} color="#06b6d4" />
            <span>{t("video_sync.timeline.trackAudio", "Audio wideo")}</span>
          </div>
          {externalAudio && (
            <div className={styles.trackLabel}>
              <Speaker224Regular fontSize={16} color="#a855f7" />
              <span>{t("video_sync.timeline.trackExternal", "Audio zewn.")}</span>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className={styles.canvas} />
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={styles.legendBox} style={{ background: "linear-gradient(135deg, #06b6d4, #10b981)" }} />
          <span>{t("video_sync.legend.waveform", "Fala dźwiękowa (Amplituda)")}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBox} style={{ backgroundColor: "rgba(234, 179, 8, 0.4)" }} />
          <span>{t("video_sync.legend.delay", "Obszar opóźnienia dźwięku (+)")}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBox} style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }} />
          <span>{t("video_sync.legend.lead", "Obszar przycięcia/wyprzedzenia (-)")}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBox} style={{ backgroundColor: "#e0475b" }} />
          <span>{t("video_sync.legend.playhead", "Głowica odtwarzania")}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBox} style={{ backgroundColor: "#06b6d4" }} />
          <span>{t("video_sync.legend.previewRange", "Obszar wycinka podglądu (np. 30s)")}</span>
        </div>
        <div style={{ marginLeft: "auto", color: tokens.colorNeutralForeground4 }}>
          {t("video_sync.legend.hint", "Wskazówka: Przytrzymaj Shift podczas przeciągania dla mikro-precyzji")}
        </div>
      </div>
    </div>
  );
}

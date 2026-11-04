// Sync timeline: the picture track stays put and the audio track is drawn shifted by the offset.
// Click the ruler or the picture to place the preview window; drag an audio track to shift it (Shift = fine).
// Only the visible viewport is painted, so long videos stay within canvas size limits at any zoom.

import { useEffect, useRef } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import {
  drawFrames,
  drawPlayhead,
  drawRuler,
  PICTURE_HEIGHT,
  prepareCanvas,
  RULER_HEIGHT,
  TimelineControls,
  useFrameTrack,
  useTimelineStyles,
  useTimelineTheme,
  useTimelineViewport,
  type LoadFrames,
} from "../../components/timeline/timelineCore";
import type { WaveformData } from "../../lib/types";

const TRACK_HEIGHT = 64;
export const OFFSET_LIMIT_SEC = 30;

const useStyles = makeStyles({
  labels: { position: "absolute", left: "8px", pointerEvents: "none" },
  label: {
    height: `${TRACK_HEIGHT}px`,
    display: "flex",
    alignItems: "flex-start",
    paddingTop: "4px",
    boxSizing: "border-box",
  },
  labelText: {
    padding: "0 4px",
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

interface WaveformTimelineProps {
  duration: number;
  /** Width / height of the video picture; 0 hides the picture track (audio-only input). */
  frameAspect: number;
  loadFrames: LoadFrames;
  /** Video's own audio, drawn unshifted for comparison when an external file is synced. */
  reference: WaveformData | null;
  /** The audio being synced; drawn shifted by `offsetSec`. */
  shifted: WaveformData | null;
  shiftedDuration: number;
  offsetSec: number;
  onOffsetChange: (offsetSec: number) => void;
  playheadSec: number | null;
  previewStartSec: number;
  previewDuration: number;
  onPreviewStartChange: (startSec: number) => void;
}

/** Peak of `points` over [t0, t1) seconds of a waveform spanning `duration`. */
function peakAt(wave: WaveformData, duration: number, t0: number, t1: number) {
  const n = wave.points.length;
  if (t1 <= 0 || t0 >= duration || n === 0) return 0;
  const i0 = Math.max(0, Math.floor((t0 / duration) * n));
  const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil((t1 / duration) * n)));
  let peak = 0;
  for (let i = i0; i < i1; i++) peak = Math.max(peak, wave.points[i]);
  return peak;
}

export function WaveformTimeline({
  duration,
  frameAspect,
  loadFrames,
  reference,
  shifted,
  shiftedDuration,
  offsetSec,
  onOffsetChange,
  playheadSec,
  previewStartSec,
  previewDuration,
  onPreviewStartChange,
}: WaveformTimelineProps) {
  const styles = useStyles();
  const timelineStyles = useTimelineStyles();
  const { t } = useTranslation();
  const theme = useTimelineTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useTimelineViewport(canvasRef, duration);
  const track = useFrameTrack(loadFrames, frameAspect, view, duration);
  const { width, scroll, pxPerSec } = view;

  const pictureHeight = frameAspect > 0 ? PICTURE_HEIGHT : 0;
  const audioTop = RULER_HEIGHT + pictureHeight;
  const tracks = reference ? 2 : 1;
  const height = audioTop + tracks * TRACK_HEIGHT;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = prepareCanvas(canvas, width, height, theme);
    if (!ctx) return;

    const timeAt = (x: number) => (scroll + x) / pxPerSec;
    const xAt = (sec: number) => sec * pxPerSec - scroll;

    if (pictureHeight > 0) drawFrames(ctx, view, track, duration, RULER_HEIGHT);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = theme.colorBrandBackground;
    ctx.fillRect(xAt(previewStartSec), 0, previewDuration * pxPerSec, height);
    ctx.globalAlpha = 1;

    drawRuler(ctx, view, theme);

    const drawTrack = (wave: WaveformData | null, waveDuration: number, shift: number, top: number, color: string) => {
      ctx.strokeStyle = theme.colorNeutralStroke2;
      ctx.beginPath();
      ctx.moveTo(0, top + 0.5);
      ctx.lineTo(width, top + 0.5);
      ctx.stroke();
      if (!wave) return;
      const mid = top + TRACK_HEIGHT / 2;
      const half = TRACK_HEIGHT / 2 - 6;
      ctx.fillStyle = color;
      for (let x = 0; x < width; x++) {
        const peak = peakAt(wave, waveDuration, timeAt(x) - shift, timeAt(x + 1) - shift);
        if (peak > 0) ctx.fillRect(x, mid - peak * half, 1, Math.max(1, peak * half * 2));
      }
    };

    if (reference) drawTrack(reference, duration, 0, audioTop, theme.colorNeutralForeground3);
    drawTrack(shifted, shiftedDuration, offsetSec, audioTop + (tracks - 1) * TRACK_HEIGHT, theme.colorBrandForeground1);

    if (playheadSec != null) drawPlayhead(ctx, view, theme, playheadSec, height);
  }, [view, track, width, height, scroll, pxPerSec, theme, pictureHeight, audioTop, reference, shifted, duration, shiftedDuration, offsetSec, tracks, playheadSec, previewStartSec, previewDuration]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    const placing = e.nativeEvent.offsetY < audioTop;
    const startX = e.clientX;
    const startOffset = offsetSec;
    const placePreview = (offsetX: number) => {
      const sec = (scroll + offsetX) / pxPerSec;
      onPreviewStartChange(Math.max(0, Math.min(duration - previewDuration, sec)));
    };
    if (placing) placePreview(e.nativeEvent.offsetX);

    const onMove = (ev: PointerEvent) => {
      if (placing) return placePreview(ev.offsetX);
      const delta = ((ev.clientX - startX) / pxPerSec) * (ev.shiftKey ? 0.1 : 1);
      const next = Math.round((startOffset + delta) * 1000) / 1000;
      onOffsetChange(Math.max(-OFFSET_LIMIT_SEC, Math.min(OFFSET_LIMIT_SEC, next)));
    };
    const onUp = () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
  };

  return (
    <div className={timelineStyles.root}>
      <canvas
        ref={canvasRef}
        className={timelineStyles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          if (e.buttons === 0) e.currentTarget.style.cursor = e.nativeEvent.offsetY < audioTop ? "pointer" : "ew-resize";
        }}
      />
      {reference && (
        <div className={styles.labels} style={{ top: audioTop }}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t("video_sync.timeline.trackAudio")}</span>
          </div>
          <div className={styles.label}>
            <span className={styles.labelText}>{t("video_sync.timeline.trackExternal")}</span>
          </div>
        </div>
      )}
      <TimelineControls view={view} />
    </div>
  );
}

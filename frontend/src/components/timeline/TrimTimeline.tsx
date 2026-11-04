// Range picker over a picture track: drag either handle or the selection itself (Shift = fine),
// click the ruler to seek, click outside the selection to move its nearest edge there.

import { useEffect, useRef } from "react";
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
} from "./timelineCore";

const BAR_HEIGHT = 32;
const HANDLE_WIDTH = 8;
const HIT_SLOP = 6;

type DragMode = "start" | "end" | "move" | "seek";

interface TrimTimelineProps {
  duration: number;
  /** Width / height of the picture; 0 draws a plain bar instead of frames. */
  frameAspect: number;
  loadFrames: LoadFrames;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  playheadSec?: number | null;
  onSeek?: (sec: number) => void;
  minLength?: number;
  /** Values are rounded to multiples of this (e.g. one frame). */
  snap?: number;
}

export function TrimTimeline({
  duration,
  frameAspect,
  loadFrames,
  start,
  end,
  onChange,
  playheadSec = null,
  onSeek,
  minLength = 0.1,
  snap = 0.001,
}: TrimTimelineProps) {
  const styles = useTimelineStyles();
  const theme = useTimelineTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useTimelineViewport(canvasRef, duration);
  const track = useFrameTrack(loadFrames, frameAspect, view, duration);
  const { width, scroll, pxPerSec } = view;
  const trackHeight = frameAspect > 0 ? PICTURE_HEIGHT : BAR_HEIGHT;
  const height = RULER_HEIGHT + trackHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = prepareCanvas(canvas, width, height, theme);
    if (!ctx) return;
    const xAt = (sec: number) => sec * pxPerSec - scroll;

    if (frameAspect > 0) drawFrames(ctx, view, track, duration, RULER_HEIGHT);
    drawRuler(ctx, view, theme);

    const x0 = xAt(start);
    const x1 = xAt(end);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = theme.colorNeutralBackground1;
    ctx.fillRect(0, RULER_HEIGHT, Math.max(0, x0), trackHeight);
    ctx.fillRect(x1, RULER_HEIGHT, Math.max(0, width - x1), trackHeight);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = theme.colorBrandBackground;
    ctx.fillRect(x0, 0, x1 - x0, RULER_HEIGHT);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = theme.colorBrandStroke1;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, RULER_HEIGHT + 1, Math.max(0, x1 - x0 - 2), trackHeight - 2);
    ctx.lineWidth = 1;
    ctx.fillStyle = theme.colorBrandBackground;
    ctx.fillRect(x0, RULER_HEIGHT, HANDLE_WIDTH, trackHeight);
    ctx.fillRect(x1 - HANDLE_WIDTH, RULER_HEIGHT, HANDLE_WIDTH, trackHeight);
    ctx.fillStyle = theme.colorNeutralForegroundOnBrand;
    for (const hx of [x0 + HANDLE_WIDTH / 2, x1 - HANDLE_WIDTH / 2]) {
      ctx.fillRect(Math.round(hx) - 1, RULER_HEIGHT + trackHeight / 2 - 6, 2, 12);
    }

    if (playheadSec != null) drawPlayhead(ctx, view, theme, playheadSec, height);
  }, [view, track, width, height, scroll, pxPerSec, theme, frameAspect, trackHeight, duration, start, end, playheadSec]);

  const round = (sec: number) => Math.round(sec / snap) * snap;

  const hitTest = (offsetX: number, offsetY: number): DragMode => {
    if (offsetY < RULER_HEIGHT) return "seek";
    const x0 = start * pxPerSec - scroll;
    const x1 = end * pxPerSec - scroll;
    if (Math.abs(offsetX - x0 - HANDLE_WIDTH / 2) <= HANDLE_WIDTH / 2 + HIT_SLOP) return "start";
    if (Math.abs(offsetX - x1 + HANDLE_WIDTH / 2) <= HANDLE_WIDTH / 2 + HIT_SLOP) return "end";
    if (offsetX > x0 && offsetX < x1) return "move";
    return offsetX < x0 ? "start" : "end";
  };

  const apply = (mode: DragMode, sec: number, delta: number, origin: { start: number; end: number }) => {
    const length = origin.end - origin.start;
    if (mode === "seek") onSeek?.(Math.max(0, Math.min(duration, sec)));
    else if (mode === "start") onChange(round(Math.max(0, Math.min(origin.end - minLength, sec))), origin.end);
    else if (mode === "end") onChange(origin.start, round(Math.min(duration, Math.max(origin.start + minLength, sec))));
    else {
      const nextStart = round(Math.max(0, Math.min(duration - length, origin.start + delta)));
      onChange(nextStart, nextStart + length);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    const mode = hitTest(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    const origin = { start, end };
    const startX = e.clientX;
    const anchorSec = (scroll + e.nativeEvent.offsetX) / pxPerSec;
    const outside = mode !== "seek" && mode !== "move" && Math.abs(e.nativeEvent.offsetX - ((mode === "start" ? start : end) * pxPerSec - scroll)) > HANDLE_WIDTH + HIT_SLOP;
    if (mode === "seek" || outside) apply(mode, anchorSec, 0, origin);

    const onMove = (ev: PointerEvent) => {
      const delta = ((ev.clientX - startX) / pxPerSec) * (ev.shiftKey ? 0.1 : 1);
      const current = mode === "start" ? origin.start : mode === "end" ? origin.end : anchorSec;
      apply(mode, outside ? anchorSec + delta : current + delta, delta, origin);
    };
    const onUp = () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
  };

  return (
    <div className={styles.root}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          if (e.buttons !== 0) return;
          const mode = hitTest(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
          const x = e.nativeEvent.offsetX;
          const nearEdge = Math.abs(x - start * pxPerSec + scroll) <= HANDLE_WIDTH + HIT_SLOP || Math.abs(x - end * pxPerSec + scroll) <= HANDLE_WIDTH + HIT_SLOP;
          e.currentTarget.style.cursor = mode === "move" ? "grab" : nearEdge && mode !== "seek" ? "ew-resize" : "pointer";
        }}
      />
      <TimelineControls view={view} />
    </div>
  );
}

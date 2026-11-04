// Shared parts of the canvas timelines: viewport (zoom + scroll), picture track loading and drawing,
// ruler and the zoom / scrollbar controls. Only the visible viewport is painted, so long media stays
// within canvas size limits at any zoom.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button, makeStyles, tokens, Tooltip, type Theme } from "@fluentui/react-components";
import { ZoomIn16Regular, ZoomOut16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { darkTheme, lightTheme, useIsDark } from "../../app/theme";
import { useSettings } from "../../stores/settings";
import type { VideoFrame } from "../../lib/types";

export const RULER_HEIGHT = 22;
export const PICTURE_HEIGHT = 48;
const MAX_PX_PER_SEC = 400;
const ZOOM_STEP = 1.5;
const FRAME_FETCH_DELAY_MS = 250;
/** Frame batches kept besides the first whole-timeline batch; older zoomed-in batches are dropped. */
const KEPT_FRAME_BATCHES = 6;

export type LoadFrames = (startSec: number, duration: number, count: number, height: number) => Promise<VideoFrame[]>;

export const useTimelineStyles = makeStyles({
  root: { position: "relative", display: "flex", flexDirection: "column", gap: "4px" },
  canvas: { display: "block", width: "100%", borderRadius: tokens.borderRadiusMedium, touchAction: "none" },
  scrollbar: { overflowX: "auto", overflowY: "hidden", height: "12px" },
  zoom: { position: "absolute", right: "4px", top: "0", display: "flex" },
});

export function useTimelineTheme(): Theme {
  return useIsDark(useSettings((s) => s.settings?.theme ?? "system")) ? darkTheme : lightTheme;
}

/** Canvas width, zoom and horizontal scroll; Ctrl+wheel zooms around the cursor, Shift+wheel scrolls. */
export function useTimelineViewport(canvasRef: RefObject<HTMLCanvasElement | null>, duration: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState(0);

  const fitPxPerSec = width > 0 ? width / Math.max(1, duration) : 1;
  const maxZoom = Math.max(1, MAX_PX_PER_SEC / fitPxPerSec);
  const pxPerSec = fitPxPerSec * zoom;
  const totalWidth = Math.max(width, Math.ceil(duration * pxPerSec));
  const scrollable = totalWidth > width;

  useEffect(() => {
    if (!scrollable) setScroll(0);
  }, [scrollable]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasRef]);

  const setZoomAt = useCallback(
    (next: number, anchorX: number) => {
      const clamped = Math.min(maxZoom, Math.max(1, next));
      const time = (scroll + anchorX) / pxPerSec;
      const nextScroll = Math.max(0, time * fitPxPerSec * clamped - anchorX);
      setZoom(clamped);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = nextScroll;
      });
    },
    [fitPxPerSec, maxZoom, pxPerSec, scroll],
  );

  // React registers wheel listeners as passive, so Ctrl+wheel zoom needs a native one to call preventDefault.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoomAt(e.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP, e.offsetX);
      } else if (scrollRef.current && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        e.preventDefault();
        scrollRef.current.scrollLeft += e.shiftKey ? e.deltaY : e.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canvasRef, setZoomAt, zoom]);

  return useMemo(
    () => ({ scrollRef, width, zoom, maxZoom, scroll, setScroll, pxPerSec, totalWidth, scrollable, setZoomAt }),
    [width, zoom, maxZoom, scroll, pxPerSec, totalWidth, scrollable, setZoomAt],
  );
}

export type TimelineViewport = ReturnType<typeof useTimelineViewport>;

/** Frames for the visible window, fetched once scrolling/zooming settles and kept as decoded images. */
export function useFrameTrack(loadFrames: LoadFrames, frameAspect: number, view: TimelineViewport, duration: number) {
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [frameBatches, setFrameBatches] = useState<VideoFrame[][]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const tileWidth = PICTURE_HEIGHT * frameAspect;
  const { width, scroll, pxPerSec } = view;

  useEffect(() => {
    setFrameBatches([]);
    imagesRef.current.clear();
  }, [loadFrames]);

  useEffect(() => {
    if (frameAspect <= 0 || width === 0 || tileWidth <= 0) return;
    const start = Math.max(0, scroll / pxPerSec);
    const end = Math.min(duration, (scroll + width) / pxPerSec);
    const count = Math.ceil(width / tileWidth);
    let current = true;
    const timer = window.setTimeout(() => {
      loadFrames(start, end - start, count, Math.round(PICTURE_HEIGHT * (window.devicePixelRatio || 1)))
        .then((frames) => {
          if (!current) return;
          for (const frame of frames) {
            if (imagesRef.current.has(frame.dataUrl)) continue;
            const img = new Image();
            img.onload = () => setImagesLoaded((n) => n + 1);
            img.src = frame.dataUrl;
            imagesRef.current.set(frame.dataUrl, img);
          }
          setFrameBatches((batches) => (batches.length === 0 ? [frames] : [batches[0], ...batches.slice(1).slice(-(KEPT_FRAME_BATCHES - 1)), frames]));
        })
        .catch(() => undefined);
    }, FRAME_FETCH_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [loadFrames, frameAspect, width, tileWidth, scroll, pxPerSec, duration]);

  return useMemo(() => ({ imagesRef, frameBatches, imagesLoaded, tileWidth }), [frameBatches, imagesLoaded, tileWidth]);
}

export type FrameTrack = ReturnType<typeof useFrameTrack>;

/** Frame closest to `time` in a list sorted by time. */
function nearestFrame(frames: VideoFrame[], time: number) {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(frames[lo - 1].time - time) < Math.abs(frames[lo].time - time)) lo--;
  return frames[lo];
}

/** Sizes the canvas for the device pixel ratio and fills the background; returns the 2D context. */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number, theme: Theme) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.colorNeutralBackground3;
  ctx.fillRect(0, 0, width, height);
  return ctx;
}

/** Picture track tiles, aligned to the timeline (not the viewport) so they don't shimmer while scrolling. */
export function drawFrames(ctx: CanvasRenderingContext2D, view: TimelineViewport, track: FrameTrack, duration: number, top: number) {
  const { scroll, pxPerSec, width } = view;
  const { tileWidth, imagesRef } = track;
  const frames = track.frameBatches.flat().sort((a, b) => a.time - b.time);
  if (frames.length === 0 || tileWidth <= 0) return;
  const endX = Math.min(width, duration * pxPerSec - scroll);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, endX, PICTURE_HEIGHT);
  ctx.clip();
  for (let tile = Math.floor(scroll / tileWidth); tile * tileWidth - scroll < endX; tile++) {
    const img = imagesRef.current.get(nearestFrame(frames, ((tile + 0.5) * tileWidth) / pxPerSec).dataUrl);
    if (img?.complete) ctx.drawImage(img, tile * tileWidth - scroll, top, tileWidth, PICTURE_HEIGHT);
  }
  ctx.restore();
}

/** Ruler with the smallest "nice" step that keeps labels ~80px apart. */
export function drawRuler(ctx: CanvasRenderingContext2D, view: TimelineViewport, theme: Theme) {
  const { scroll, pxPerSec, width } = view;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const step = steps.find((s) => s * pxPerSec >= 80) ?? 3600;
  const decimals = step < 0.5 ? 2 : step < 1 ? 1 : 0;
  ctx.strokeStyle = theme.colorNeutralStroke1;
  ctx.fillStyle = theme.colorNeutralForeground3;
  ctx.font = `11px ${theme.fontFamilyBase}`;
  ctx.textAlign = "left";
  ctx.lineWidth = 1;
  const first = Math.floor(scroll / pxPerSec / step);
  for (let i = first; i * step <= (scroll + width) / pxPerSec; i++) {
    const sec = i * step;
    const x = Math.round(sec * pxPerSec - scroll) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT - 6);
    ctx.lineTo(x, RULER_HEIGHT);
    ctx.stroke();
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    ctx.fillText(`${m}:${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, "0")}`, x + 3, 12);
  }
}

export function drawPlayhead(ctx: CanvasRenderingContext2D, view: TimelineViewport, theme: Theme, sec: number, height: number) {
  const x = Math.round(sec * view.pxPerSec - view.scroll) + 0.5;
  ctx.strokeStyle = theme.colorNeutralForeground1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

export function TimelineControls({ view }: { view: TimelineViewport }) {
  const styles = useTimelineStyles();
  const { t } = useTranslation();
  const { zoom, maxZoom, width, setZoomAt, scrollable, scrollRef, setScroll, totalWidth } = view;
  return (
    <>
      <div className={styles.zoom}>
        <Tooltip content={t("common.zoomOut")} relationship="label">
          <Button size="small" appearance="transparent" icon={<ZoomOut16Regular />} disabled={zoom <= 1} onClick={() => setZoomAt(zoom / ZOOM_STEP, width / 2)} />
        </Tooltip>
        <Tooltip content={t("common.zoomIn")} relationship="label">
          <Button size="small" appearance="transparent" icon={<ZoomIn16Regular />} disabled={zoom >= maxZoom} onClick={() => setZoomAt(zoom * ZOOM_STEP, width / 2)} />
        </Tooltip>
      </div>
      {scrollable && (
        <div ref={scrollRef} className={styles.scrollbar} onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}>
          <div style={{ width: totalWidth, height: 1 }} />
        </div>
      )}
    </>
  );
}

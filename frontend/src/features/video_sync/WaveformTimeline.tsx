// Sync timeline: the picture track stays put and the audio track is drawn shifted by the offset.
// Click the ruler or the picture to place the preview window; drag an audio track to shift it (Shift = fine).
// Only the visible viewport is painted, so long videos stay within canvas size limits at any zoom.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, makeStyles, tokens, Tooltip } from "@fluentui/react-components";
import { ZoomIn16Regular, ZoomOut16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { darkTheme, lightTheme, useIsDark } from "../../app/theme";
import { useSettings } from "../../stores/settings";
import type { VideoFrame, WaveformData } from "../../lib/types";

const RULER_HEIGHT = 22;
const PICTURE_HEIGHT = 48;
const TRACK_HEIGHT = 64;
const MAX_PX_PER_SEC = 400;
const ZOOM_STEP = 1.5;
export const OFFSET_LIMIT_SEC = 30;
const FRAME_FETCH_DELAY_MS = 250;
/** Frame batches kept besides the first whole-video batch; older zoomed-in batches are dropped. */
const KEPT_FRAME_BATCHES = 6;

const useStyles = makeStyles({
  root: { position: "relative", display: "flex", flexDirection: "column", gap: "4px" },
  canvas: { display: "block", width: "100%", borderRadius: tokens.borderRadiusMedium, touchAction: "none" },
  scrollbar: { overflowX: "auto", overflowY: "hidden", height: "12px" },
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
  zoom: { position: "absolute", right: "4px", top: "0", display: "flex" },
});

interface WaveformTimelineProps {
  duration: number;
  /** Width / height of the video picture; 0 hides the picture track (audio-only input). */
  frameAspect: number;
  loadFrames: (startSec: number, duration: number, count: number, height: number) => Promise<VideoFrame[]>;
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
  const { t } = useTranslation();
  const theme = useIsDark(useSettings((s) => s.settings?.theme ?? "system")) ? darkTheme : lightTheme;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState(0);
  const [frameBatches, setFrameBatches] = useState<VideoFrame[][]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(0);

  const pictureHeight = frameAspect > 0 ? PICTURE_HEIGHT : 0;
  const audioTop = RULER_HEIGHT + pictureHeight;
  const tracks = reference ? 2 : 1;
  const height = audioTop + tracks * TRACK_HEIGHT;
  const fitPxPerSec = width > 0 ? width / Math.max(1, duration) : 1;
  const maxZoom = Math.max(1, MAX_PX_PER_SEC / fitPxPerSec);
  const pxPerSec = fitPxPerSec * zoom;
  const totalWidth = Math.max(width, Math.ceil(duration * pxPerSec));
  const scrollable = totalWidth > width;
  const tileWidth = PICTURE_HEIGHT * frameAspect;

  useEffect(() => {
    if (!scrollable) setScroll(0);
  }, [scrollable]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setFrameBatches([]);
    imagesRef.current.clear();
  }, [loadFrames]);

  // Fetch frames for the visible window once scrolling/zooming settles.
  useEffect(() => {
    if (pictureHeight === 0 || width === 0 || tileWidth <= 0) return;
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
  }, [loadFrames, pictureHeight, width, tileWidth, scroll, pxPerSec, duration]);

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
  }, [setZoomAt, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const timeAt = (x: number) => (scroll + x) / pxPerSec;
    const xAt = (sec: number) => sec * pxPerSec - scroll;
    const endX = Math.min(width, xAt(duration));

    ctx.fillStyle = theme.colorNeutralBackground3;
    ctx.fillRect(0, 0, width, height);

    // Picture track: tiles aligned to the timeline (not the viewport) so they don't shimmer while scrolling.
    const frames = frameBatches.flat().sort((a, b) => a.time - b.time);
    if (pictureHeight > 0 && frames.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, RULER_HEIGHT, endX, pictureHeight);
      ctx.clip();
      for (let tile = Math.floor(scroll / tileWidth); tile * tileWidth - scroll < endX; tile++) {
        const img = imagesRef.current.get(nearestFrame(frames, ((tile + 0.5) * tileWidth) / pxPerSec).dataUrl);
        if (img?.complete) ctx.drawImage(img, tile * tileWidth - scroll, RULER_HEIGHT, tileWidth, pictureHeight);
      }
      ctx.restore();
    }

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = theme.colorBrandBackground;
    ctx.fillRect(xAt(previewStartSec), 0, previewDuration * pxPerSec, height);
    ctx.globalAlpha = 1;

    // Ruler: pick the smallest "nice" step that keeps labels ~80px apart.
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    const step = steps.find((s) => s * pxPerSec >= 80) ?? 3600;
    ctx.strokeStyle = theme.colorNeutralStroke1;
    ctx.fillStyle = theme.colorNeutralForeground3;
    ctx.font = `11px ${theme.fontFamilyBase}`;
    ctx.textAlign = "left";
    ctx.lineWidth = 1;
    for (let sec = Math.floor(timeAt(0) / step) * step; sec <= timeAt(width); sec += step) {
      const x = Math.round(xAt(sec)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - 6);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      ctx.fillText(`${m}:${(step < 1 ? s.toFixed(1) : String(Math.round(s))).padStart(step < 1 ? 4 : 2, "0")}`, x + 3, 12);
    }

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

    if (playheadSec != null) {
      const x = Math.round(xAt(playheadSec)) + 0.5;
      ctx.strokeStyle = theme.colorNeutralForeground1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [width, height, scroll, pxPerSec, theme, frameBatches, imagesLoaded, pictureHeight, tileWidth, audioTop, reference, shifted, duration, shiftedDuration, offsetSec, tracks, playheadSec, previewStartSec, previewDuration]);

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
    <div className={styles.root}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
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
      <div className={styles.zoom}>
        <Tooltip content={t("video_sync.timeline.zoomOut")} relationship="label">
          <Button size="small" appearance="transparent" icon={<ZoomOut16Regular />} disabled={zoom <= 1} onClick={() => setZoomAt(zoom / ZOOM_STEP, width / 2)} />
        </Tooltip>
        <Tooltip content={t("video_sync.timeline.zoomIn")} relationship="label">
          <Button size="small" appearance="transparent" icon={<ZoomIn16Regular />} disabled={zoom >= maxZoom} onClick={() => setZoomAt(zoom * ZOOM_STEP, width / 2)} />
        </Tooltip>
      </div>
      {scrollable && (
        <div ref={scrollRef} className={styles.scrollbar} onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}>
          <div style={{ width: totalWidth, height: 1 }} />
        </div>
      )}
    </div>
  );
}

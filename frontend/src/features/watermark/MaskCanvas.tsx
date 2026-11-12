// Image with a paintable mask overlay. The mask canvas has the image's natural size and is
// scaled with CSS; strokes are opaque (alpha = mask) and shown semi-transparent.
// Undo keeps only the area each stroke touched, so a large photo does not hold gigabytes of copies.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { ON_IMAGE } from "../../lib/onImage";

export interface MaskCanvasHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
}

interface MaskCanvasProps {
  src: string;
  width: number;
  height: number;
  brush: number;
  tool: "brush" | "eraser";
  /** PNG data URL painted back when the canvas opens, e.g. after switching pages. */
  savedMask?: string | null;
  /** Receives the mask (or null when empty) when the canvas closes. */
  onSaveMask?: (mask: string | null) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean; hasMask: boolean }) => void;
}

interface HistoryEntry {
  x: number;
  y: number;
  pixels: ImageData;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const HISTORY_BYTES = 256 * 1024 * 1024;
const MASK_COLOR = "rgb(255, 64, 64)";

const useStyles = makeStyles({
  stage: {
    position: "relative",
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    cursor: "none",
    touchAction: "none",
  },
  frame: { position: "relative", boxShadow: tokens.shadow16, lineHeight: 0 },
  image: { width: "100%", height: "100%", display: "block", userSelect: "none" },
  mask: { position: "absolute", inset: "0", width: "100%", height: "100%", opacity: 0.55, mixBlendMode: "normal" },
  cursor: {
    position: "absolute",
    pointerEvents: "none",
    borderRadius: "50%",
    border: `1.5px solid ${ON_IMAGE.light}`,
    boxShadow: `0 0 0 1px ${ON_IMAGE.outline}`,
    transform: "translate(-50%, -50%)",
  },
});

export const MaskCanvas = forwardRef<MaskCanvasHandle, MaskCanvasProps>(function MaskCanvas(
  { src, width, height, brush, tool, savedMask, onSaveMask, onHistoryChange },
  ref,
) {
  const styles = useStyles();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const history = useRef<{ undo: HistoryEntry[]; redo: HistoryEntry[] }>({ undo: [], redo: [] });
  const drawing = useRef<{ last: { x: number; y: number }; box: Box } | null>(null);
  const before = useRef<HTMLCanvasElement | null>(null);
  const dirty = useRef(false);
  // The saved mask belongs to the image shown when the canvas opened.
  const savedMaskRef = useRef(savedMask);
  const savedMaskSrc = useRef(src);
  const onSaveMaskRef = useRef(onSaveMask);
  onSaveMaskRef.current = onSaveMask;

  const ctx = () => canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;

  const report = useCallback(() => {
    onHistoryChange?.({
      canUndo: history.current.undo.length > 0,
      canRedo: history.current.redo.length > 0,
      hasMask: dirty.current,
    });
  }, [onHistoryChange]);

  // Fit the image into the stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const { clientWidth: sw, clientHeight: sh } = stage;
      const scale = Math.min(sw / width, sh / height, 1);
      setDisplay({ w: Math.floor(width * scale), h: Math.floor(height * scale) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [width, height]);

  // New image → fresh history; the saved mask is painted back only on first open (a new image has none).
  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.clearRect(0, 0, width, height);
    history.current = { undo: [], redo: [] };
    before.current = null;
    dirty.current = false;
    report();
    if (src !== savedMaskSrc.current) savedMaskRef.current = null;
    const mask = savedMaskRef.current;
    if (!mask) return;
    let current = true;
    const img = new Image();
    img.onload = () => {
      if (!current) return;
      savedMaskRef.current = null;
      c.drawImage(img, 0, 0, width, height);
      dirty.current = true;
      report();
    };
    img.src = mask;
    return () => {
      current = false;
    };
  }, [src, width, height]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new image clears the mask and its history

  // A mask that has not been painted back yet is handed on as it is.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () =>
      onSaveMaskRef.current?.(canvas && dirty.current ? canvas.toDataURL("image/png") : (savedMaskRef.current ?? null));
  }, []);

  const scale = display.w ? width / display.w : 1;

  const toImage = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * width, y: ((e.clientY - rect.top) / rect.height) * height };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = ctx();
    if (!c) return;
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = MASK_COLOR;
    c.fillStyle = MASK_COLOR;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = brush * scale;
    c.beginPath();
    if (from.x === to.x && from.y === to.y) {
      c.arc(to.x, to.y, (brush * scale) / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.moveTo(from.x, from.y);
      c.lineTo(to.x, to.y);
      c.stroke();
    }
  };

  const push = (list: HistoryEntry[], entry: HistoryEntry) => {
    list.push(entry);
    let bytes = list.reduce((sum, e) => sum + e.pixels.data.length, 0);
    while (bytes > HISTORY_BYTES && list.length > 1) bytes -= list.shift()!.pixels.data.length;
  };

  const record = (entry: HistoryEntry) => {
    push(history.current.undo, entry);
    history.current.redo = [];
  };

  // A copy of the canvas before the stroke; the stroke's area is cut from it when the stroke ends.
  const beginStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const copy = before.current ?? document.createElement("canvas");
    copy.width = width;
    copy.height = height;
    const c = copy.getContext("2d", { willReadFrequently: true });
    if (!c) return;
    c.clearRect(0, 0, width, height);
    c.drawImage(canvas, 0, 0);
    before.current = copy;
  };

  const endStroke = (box: Box) => {
    const c = before.current?.getContext("2d", { willReadFrequently: true });
    const x = Math.max(0, Math.floor(box.x0));
    const y = Math.max(0, Math.floor(box.y0));
    const w = Math.min(width, Math.ceil(box.x1)) - x;
    const h = Math.min(height, Math.ceil(box.y1)) - y;
    if (!c || w <= 0 || h <= 0) return;
    record({ x, y, pixels: c.getImageData(x, y, w, h) });
  };

  const swap = (from: HistoryEntry[], to: HistoryEntry[]) => {
    const c = ctx();
    const entry = from.pop();
    if (!c || !entry) return;
    const { x, y, pixels } = entry;
    push(to, { x, y, pixels: c.getImageData(x, y, pixels.width, pixels.height) });
    c.putImageData(pixels, x, y);
    dirty.current = hasPixels();
    report();
  };

  const hasPixels = () => {
    const c = ctx();
    if (!c) return false;
    const data = c.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  };

  useImperativeHandle(ref, () => ({
    undo: () => swap(history.current.undo, history.current.redo),
    redo: () => swap(history.current.redo, history.current.undo),
    clear: () => {
      const c = ctx();
      if (!c) return;
      record({ x: 0, y: 0, pixels: c.getImageData(0, 0, width, height) });
      c.clearRect(0, 0, width, height);
      dirty.current = false;
      report();
    },
    isEmpty: () => !hasPixels(),
    toDataUrl: () => canvasRef.current!.toDataURL("image/png"),
  }));

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      onPointerLeave={() => setCursor(null)}
      onPointerMove={(e) => {
        const rect = stageRef.current!.getBoundingClientRect();
        setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      <div className={styles.frame} style={{ width: display.w, height: display.h }}>
        <img className={styles.image} src={src} alt="" draggable={false} />
        <canvas
          ref={canvasRef}
          className={styles.mask}
          width={width}
          height={height}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            beginStroke();
            const p = toImage(e);
            const r = (brush * scale) / 2 + 2;
            drawing.current = { last: p, box: { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r } };
            stroke(p, p);
          }}
          onPointerMove={(e) => {
            const current = drawing.current;
            if (!current) return;
            const p = toImage(e);
            const r = (brush * scale) / 2 + 2;
            stroke(current.last, p);
            current.last = p;
            current.box = {
              x0: Math.min(current.box.x0, p.x - r),
              y0: Math.min(current.box.y0, p.y - r),
              x1: Math.max(current.box.x1, p.x + r),
              y1: Math.max(current.box.y1, p.y + r),
            };
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            endStroke(drawing.current.box);
            drawing.current = null;
            dirty.current = tool === "brush" ? true : hasPixels();
            report();
          }}
        />
      </div>
      {cursor && (
        <div
          className={styles.cursor}
          style={{
            left: cursor.x,
            top: cursor.y,
            width: brush,
            height: brush,
            borderStyle: tool === "eraser" ? "dashed" : "solid",
          }}
        />
      )}
    </div>
  );
});

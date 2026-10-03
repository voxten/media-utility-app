// Image with a paintable mask overlay. The mask canvas has the image's natural size and is
// scaled with CSS; strokes are opaque (alpha = mask) and shown semi-transparent.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";

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
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean; hasMask: boolean }) => void;
}

const HISTORY_LIMIT = 30;
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
    border: "1.5px solid #fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
    transform: "translate(-50%, -50%)",
  },
});

export const MaskCanvas = forwardRef<MaskCanvasHandle, MaskCanvasProps>(function MaskCanvas(
  { src, width, height, brush, tool, onHistoryChange },
  ref,
) {
  const styles = useStyles();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const history = useRef<{ undo: ImageData[]; redo: ImageData[] }>({ undo: [], redo: [] });
  const drawing = useRef<{ last: { x: number; y: number } } | null>(null);
  const dirty = useRef(false);

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

  // New image → fresh mask and history.
  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.clearRect(0, 0, width, height);
    history.current = { undo: [], redo: [] };
    dirty.current = false;
    report();
  }, [src, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const snapshot = () => {
    const c = ctx();
    if (!c) return;
    history.current.undo.push(c.getImageData(0, 0, width, height));
    if (history.current.undo.length > HISTORY_LIMIT) history.current.undo.shift();
    history.current.redo = [];
  };

  const hasPixels = () => {
    const c = ctx();
    if (!c) return false;
    const data = c.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  };

  useImperativeHandle(ref, () => ({
    undo: () => {
      const c = ctx();
      const prev = history.current.undo.pop();
      if (!c || !prev) return;
      history.current.redo.push(c.getImageData(0, 0, width, height));
      c.putImageData(prev, 0, 0);
      dirty.current = hasPixels();
      report();
    },
    redo: () => {
      const c = ctx();
      const next = history.current.redo.pop();
      if (!c || !next) return;
      history.current.undo.push(c.getImageData(0, 0, width, height));
      c.putImageData(next, 0, 0);
      dirty.current = hasPixels();
      report();
    },
    clear: () => {
      const c = ctx();
      if (!c) return;
      snapshot();
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
            snapshot();
            const p = toImage(e);
            drawing.current = { last: p };
            stroke(p, p);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const p = toImage(e);
            stroke(drawing.current.last, p);
            drawing.current.last = p;
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
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

// Split view of ImageComparison (draggable divider). Pages use ImageComparison, not this directly.

import React, { useEffect, useRef, useState } from "react";
import { Caption1, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ChevronLeft16Filled, ChevronRight16Filled } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    maxHeight: "100%",
    width: "100%",
    height: "100%",
    userSelect: "none",
    touchAction: "none",
    overflow: "hidden",
    boxSizing: "border-box",
    minHeight: 0,
    minWidth: 0,
  },
  frame: {
    position: "relative",
    cursor: "ew-resize",
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    boxSizing: "border-box",
    lineHeight: 0,
    flexShrink: 0,
    outlineStyle: "none",
  },
  layerImg: {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    objectFit: "fill",
    display: "block",
    userSelect: "none",
    pointerEvents: "none",
  },
  overlay: {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    pointerEvents: "none",
  },
  divider: {
    position: "absolute",
    top: "0",
    bottom: "0",
    width: "2px",
    marginLeft: "-1px",
    backgroundColor: "#fff",
    boxShadow: "0 0 6px rgba(0,0,0,.7)",
    zIndex: 3,
    pointerEvents: "none",
  },
  handle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    color: "#222",
    boxShadow: tokens.shadow8,
    cursor: "ew-resize",
    zIndex: 4,
    pointerEvents: "none",
  },
  label: {
    position: "absolute",
    top: "10px",
    padding: "3px 8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0,0,0,.65)",
    color: "#fff",
    lineHeight: tokens.lineHeightBase200,
    zIndex: 4,
    pointerEvents: "none",
  },
  labelLeft: { left: "10px" },
  labelRight: { right: "10px" },
});

interface CompareSliderProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  maxHeight?: string;
  aspectRatio?: number;
}

export function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  maxHeight,
  aspectRatio,
}: CompareSliderProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [detectedAspect, setDetectedAspect] = useState<number | null>(aspectRatio ?? null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    measure();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (aspectRatio && aspectRatio > 0) {
      setDetectedAspect(aspectRatio);
      return;
    }
    const src = before || after;
    if (!src) return;
    const img = new Image();
    img.src = src;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setDetectedAspect(img.naturalWidth / img.naturalHeight);
    } else {
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setDetectedAspect(img.naturalWidth / img.naturalHeight);
        }
      };
    }
  }, [before, after, aspectRatio]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0 && !aspectRatio) {
      setDetectedAspect(naturalWidth / naturalHeight);
    }
  };

  const move = (clientX: number) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  };

  const effAspect = aspectRatio ?? detectedAspect;

  let frameW: number | undefined;
  let frameH: number | undefined;

  if (containerSize && effAspect && effAspect > 0) {
    const cAspect = containerSize.width / containerSize.height;
    if (cAspect > effAspect) {
      // Container is wider than image: constrained by height
      frameH = Math.floor(containerSize.height);
      frameW = Math.floor(containerSize.height * effAspect);
    } else {
      // Container is taller than image: constrained by width
      frameW = Math.floor(containerSize.width);
      frameH = Math.floor(containerSize.width / effAspect);
    }
  }

  const frameStyle: React.CSSProperties =
    frameW != null && frameH != null
      ? { width: `${frameW}px`, height: `${frameH}px` }
      : {
          maxWidth: "100%",
          maxHeight: "100%",
          width: "100%",
          height: "100%",
          aspectRatio: effAspect ? `${effAspect}` : undefined,
          opacity: effAspect ? 1 : 0,
        };

  return (
    <div
      ref={containerRef}
      className={styles.root}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div
        ref={frameRef}
        className={styles.frame}
        style={frameStyle}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
        }}
        tabIndex={0}
        role="slider"
        aria-valuenow={Math.round(pos)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <img
          className={styles.layerImg}
          src={after}
          alt={afterLabel}
          draggable={false}
          onLoad={handleImageLoad}
        />

        <div
          className={styles.overlay}
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <img
            className={styles.layerImg}
            src={before}
            alt={beforeLabel}
            draggable={false}
            onLoad={handleImageLoad}
          />
        </div>

        <div className={styles.divider} style={{ left: `${pos}%` }}>
          <div className={styles.handle}>
            <ChevronLeft16Filled />
            <ChevronRight16Filled />
          </div>
        </div>

        <Caption1 className={mergeClasses(styles.label, styles.labelLeft)}>
          {beforeLabel}
        </Caption1>
        <Caption1 className={mergeClasses(styles.label, styles.labelRight)}>
          {afterLabel}
        </Caption1>
      </div>
    </div>
  );
}

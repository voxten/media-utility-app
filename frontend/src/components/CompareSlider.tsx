// Before/after image comparison with a draggable divider.

import { useRef, useState } from "react";
import { Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { ChevronLeft16Filled, ChevronRight16Filled } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    position: "relative",
    maxWidth: "100%",
    maxHeight: "100%",
    lineHeight: 0,
    cursor: "ew-resize",
    userSelect: "none",
    touchAction: "none",
    boxShadow: tokens.shadow16,
  },
  img: { display: "block", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  after: { position: "absolute", inset: "0", width: "100%", height: "100%" },
  divider: { position: "absolute", top: "0", bottom: "0", width: "2px", marginLeft: "-1px", backgroundColor: "#fff", boxShadow: "0 0 4px rgba(0,0,0,.6)" },
  handle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    color: "#222",
    boxShadow: tokens.shadow8,
  },
  label: {
    position: "absolute",
    top: "10px",
    padding: "2px 8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0,0,0,.55)",
    color: "#fff",
    lineHeight: tokens.lineHeightBase200,
  },
});

interface CompareSliderProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  maxHeight?: string;
}

export function CompareSlider({ before, after, beforeLabel, afterLabel, maxHeight = "100%" }: CompareSliderProps) {
  const styles = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);

  const move = (clientX: number) => {
    const rect = rootRef.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={{ maxHeight }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
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
      <img className={styles.img} src={before} alt={beforeLabel} draggable={false} style={{ maxHeight }} />
      <img className={`${styles.img} ${styles.after}`} src={after} alt={afterLabel} draggable={false} style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <div className={styles.divider} style={{ left: `${pos}%` }}>
        <div className={styles.handle}>
          <ChevronLeft16Filled />
          <ChevronRight16Filled />
        </div>
      </div>
      <Caption1 className={styles.label} style={{ left: 10 }}>
        {beforeLabel}
      </Caption1>
      <Caption1 className={styles.label} style={{ right: 10 }}>
        {afterLabel}
      </Caption1>
    </div>
  );
}

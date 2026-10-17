import { useEffect, useRef, useState } from "react";
import { makeStyles, Spinner, tokens } from "@fluentui/react-components";
import { InteractiveCropOverlay, type CropRect } from "./InteractiveCropOverlay";
import type { ActiveTool } from "./types";

const useStyles = makeStyles({
  stage: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    backgroundImage: `
      linear-gradient(45deg, rgba(0,0,0,0.06) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(0,0,0,0.06) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.06) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.06) 75%)
    `,
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
    padding: "16px",
    boxSizing: "border-box",
  },
  frame: {
    position: "relative",
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusSmall,
    lineHeight: 0,
    userSelect: "none",
  },
  image: {
    width: "100%",
    height: "100%",
    display: "block",
    userSelect: "none",
    pointerEvents: "none",
    borderRadius: tokens.borderRadiusSmall,
  },
});

interface ImageCanvasStageProps {
  imageSrc: string | null;
  naturalWidth: number;
  naturalHeight: number;
  activeTool: ActiveTool;
  crop: CropRect;
  cropPreset: string;
  isLoading?: boolean;
  onCropChange: (crop: CropRect) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onResetCrop: () => void;
}

export function ImageCanvasStage({
  imageSrc,
  naturalWidth,
  naturalHeight,
  activeTool,
  crop,
  cropPreset,
  isLoading,
  onCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
}: ImageCanvasStageProps) {
  const styles = useStyles();
  const stageRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure stage and calculate fitted dimensions maintaining aspect ratio
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !naturalWidth || !naturalHeight) return;

    const fit = () => {
      const padding = 32;
      const sw = Math.max(100, stage.clientWidth - padding);
      const sh = Math.max(100, stage.clientHeight - padding);

      const scale = Math.min(sw / naturalWidth, sh / naturalHeight, 1);
      setDisplaySize({
        w: Math.max(1, Math.floor(naturalWidth * scale)),
        h: Math.max(1, Math.floor(naturalHeight * scale)),
      });
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [naturalWidth, naturalHeight]);

  return (
    <div ref={stageRef} className={styles.stage}>
      {isLoading && !imageSrc ? (
        <Spinner size="large" />
      ) : imageSrc && displaySize.w > 0 && displaySize.h > 0 ? (
        <div
          className={styles.frame}
          style={{
            width: `${displaySize.w}px`,
            height: `${displaySize.h}px`,
          }}
        >
          <img
            className={styles.image}
            src={imageSrc}
            alt=""
            style={{ width: `${displaySize.w}px`, height: `${displaySize.h}px` }}
          />

          {/* Interactive Crop overlay when crop tool is active */}
          {activeTool === "crop" && (
            <InteractiveCropOverlay
              naturalWidth={naturalWidth}
              naturalHeight={naturalHeight}
              displayedWidth={displaySize.w}
              displayedHeight={displaySize.h}
              crop={crop}
              cropPreset={cropPreset}
              onCropChange={onCropChange}
              onApplyCrop={onApplyCrop}
              onCancelCrop={onCancelCrop}
              onResetCrop={onResetCrop}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, makeStyles, mergeClasses, Tooltip, tokens } from "@fluentui/react-components";
import { Checkmark16Filled, Dismiss16Regular, ArrowReset24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface InteractiveCropOverlayProps {
  naturalWidth: number;
  naturalHeight: number;
  displayedWidth: number;
  displayedHeight: number;
  crop: CropRect;
  cropPreset: string;
  onCropChange: (crop: CropRect) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onResetCrop: () => void;
}

// Overlay colours sit on top of the photo itself, so they are fixed rather than theme tokens.
const SHROUD = "rgba(0, 0, 0, 0.58)";
const GUIDE = "rgba(255, 255, 255, 0.7)";
const CHROME = "rgba(18, 18, 18, 0.9)";
const HANDLE_OFFSET = "-5px";
const HANDLE_CENTER = "calc(50% - 5px)";

const useStyles = makeStyles({
  root: { position: "absolute", top: 0, left: 0, cursor: "crosshair", userSelect: "none", touchAction: "none", overflow: "hidden" },
  shroud: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", fill: SHROUD },
  box: {
    position: "absolute",
    boxSizing: "border-box",
    border: `1.5px solid ${tokens.colorNeutralForegroundStaticInverted}`,
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.3)",
    cursor: "move",
  },
  grid: { position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.45, transitionProperty: "opacity", transitionDuration: tokens.durationFaster },
  gridActive: { opacity: 0.75 },
  lineV: { position: "absolute", top: 0, bottom: 0, width: "1px", backgroundColor: GUIDE },
  lineH: { position: "absolute", left: 0, right: 0, height: "1px", backgroundColor: GUIDE },
  third1V: { left: "33.33%" },
  third2V: { left: "66.66%" },
  third1H: { top: "33.33%" },
  third2H: { top: "66.66%" },
  handle: {
    position: "absolute",
    width: "10px",
    height: "10px",
    boxSizing: "border-box",
    backgroundColor: tokens.colorNeutralForegroundStaticInverted,
    border: `1.5px solid ${tokens.colorNeutralForeground1Static}`,
    borderRadius: tokens.borderRadiusSmall,
    zIndex: 15,
  },
  nw: { top: HANDLE_OFFSET, left: HANDLE_OFFSET, cursor: "nwse-resize" },
  ne: { top: HANDLE_OFFSET, right: HANDLE_OFFSET, cursor: "nesw-resize" },
  se: { bottom: HANDLE_OFFSET, right: HANDLE_OFFSET, cursor: "nwse-resize" },
  sw: { bottom: HANDLE_OFFSET, left: HANDLE_OFFSET, cursor: "nesw-resize" },
  n: { top: HANDLE_OFFSET, left: HANDLE_CENTER, cursor: "ns-resize" },
  s: { bottom: HANDLE_OFFSET, left: HANDLE_CENTER, cursor: "ns-resize" },
  w: { top: HANDLE_CENTER, left: HANDLE_OFFSET, cursor: "ew-resize" },
  e: { top: HANDLE_CENTER, right: HANDLE_OFFSET, cursor: "ew-resize" },
  pill: {
    position: "absolute",
    left: "6px",
    padding: "2px 8px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: CHROME,
    color: tokens.colorNeutralForegroundStaticInverted,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 10,
  },
  pillAbove: { top: "-28px" },
  pillInside: { top: "6px" },
  toolbar: {
    position: "absolute",
    right: "8px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 6px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: CHROME,
    boxShadow: tokens.shadow8,
    zIndex: 20,
  },
  toolbarBelow: { bottom: "-38px" },
  toolbarInside: { bottom: "8px" },
});

type DragMode =
  | "create"
  | "move"
  | "handle-nw"
  | "handle-ne"
  | "handle-se"
  | "handle-sw"
  | "handle-n"
  | "handle-s"
  | "handle-e"
  | "handle-w"
  | null;

export function InteractiveCropOverlay({
  naturalWidth,
  naturalHeight,
  displayedWidth,
  displayedHeight,
  crop,
  cropPreset,
  onCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
}: InteractiveCropOverlayProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    initialCrop: CropRect;
  } | null>(null);

  // Conversion helpers between screen coords (inside container) and natural image coords
  const scale = displayedWidth > 0 && naturalWidth > 0 ? displayedWidth / naturalWidth : 1;
  const toScreen = useCallback(
    (val: number) => Math.round(val * scale),
    [scale]
  );
  const toNatural = useCallback(
    (val: number) => (scale > 0 ? Math.round(val / scale) : val),
    [scale]
  );

  const boxX = toScreen(crop.x);
  const boxY = toScreen(crop.y);
  const boxW = Math.max(1, toScreen(crop.w));
  const boxH = Math.max(1, toScreen(crop.h));

  const getAspectRatio = useCallback((): number | null => {
    switch (cropPreset) {
      case "1_1":
        return 1;
      case "16_9":
        return 16 / 9;
      case "9_16":
        return 9 / 16;
      case "4_3":
        return 4 / 3;
      case "3_2":
        return 3 / 2;
      case "original":
        return naturalWidth && naturalHeight ? naturalWidth / naturalHeight : null;
      case "free":
      default:
        return null;
    }
  }, [cropPreset, naturalWidth, naturalHeight]);

  // Handle pointer down on handles, box or background
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    if (mode === "create") {
      const natX = Math.max(0, Math.min(naturalWidth - 10, toNatural(pointerX)));
      const natY = Math.max(0, Math.min(naturalHeight - 10, toNatural(pointerY)));
      const initial: CropRect = { x: natX, y: natY, w: 10, h: 10 };
      onCropChange(initial);
      dragStartRef.current = { pointerX, pointerY, initialCrop: initial };
      setDragMode("create");
    } else {
      dragStartRef.current = { pointerX, pointerY, initialCrop: { ...crop } };
      setDragMode(mode);
    }
  };

  // Window pointer move and up listeners for fluid dragging
  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const deltaX = toNatural(currentX - dragStartRef.current.pointerX);
      const deltaY = toNatural(currentY - dragStartRef.current.pointerY);
      const init = dragStartRef.current.initialCrop;
      const aspect = getAspectRatio();

      let newX = init.x;
      let newY = init.y;
      let newW = init.w;
      let newH = init.h;

      if (dragMode === "move") {
        newX = Math.max(0, Math.min(naturalWidth - init.w, init.x + deltaX));
        newY = Math.max(0, Math.min(naturalHeight - init.h, init.y + deltaY));
      } else if (dragMode === "create") {
        const startX = init.x;
        const startY = init.y;
        const currNatX = Math.max(0, Math.min(naturalWidth, toNatural(currentX)));
        const currNatY = Math.max(0, Math.min(naturalHeight, toNatural(currentY)));

        let rawW = Math.abs(currNatX - startX);
        let rawH = Math.abs(currNatY - startY);

        if (aspect) {
          if (rawW / aspect > rawH) {
            rawH = Math.round(rawW / aspect);
          } else {
            rawW = Math.round(rawH * aspect);
          }
        }

        newX = currNatX < startX ? Math.max(0, startX - rawW) : startX;
        newY = currNatY < startY ? Math.max(0, startY - rawH) : startY;
        newW = Math.max(10, Math.min(naturalWidth - newX, rawW));
        newH = Math.max(10, Math.min(naturalHeight - newY, rawH));
      } else {
        const right = init.x + init.w;
        const bottom = init.y + init.h;

        if (dragMode.includes("-e") || dragMode === "handle-ne" || dragMode === "handle-se") {
          newW = Math.max(10, Math.min(naturalWidth - init.x, init.w + deltaX));
          if (aspect) newH = Math.round(newW / aspect);
        }
        if (dragMode.includes("-s") || dragMode === "handle-se" || dragMode === "handle-sw") {
          newH = Math.max(10, Math.min(naturalHeight - init.y, init.h + deltaY));
          if (aspect && !dragMode.includes("-e") && !dragMode.includes("-w")) {
            newW = Math.round(newH * aspect);
          }
        }
        if (dragMode.includes("-w") || dragMode === "handle-nw" || dragMode === "handle-sw") {
          const candidateX = Math.max(0, Math.min(right - 10, init.x + deltaX));
          newW = right - candidateX;
          if (aspect) {
            newH = Math.round(newW / aspect);
            newY = Math.max(0, Math.min(bottom - 10, bottom - newH));
          }
          newX = candidateX;
        }
        if (dragMode.includes("-n") || dragMode === "handle-nw" || dragMode === "handle-ne") {
          const candidateY = Math.max(0, Math.min(bottom - 10, init.y + deltaY));
          newH = bottom - candidateY;
          if (aspect && !dragMode.includes("-w") && !dragMode.includes("-e")) {
            newW = Math.round(newH * aspect);
          }
          newY = candidateY;
        }

        if (newX + newW > naturalWidth) newW = naturalWidth - newX;
        if (newY + newH > naturalHeight) newH = naturalHeight - newY;
        if (aspect) {
          if (newW / aspect > newH) newW = Math.round(newH * aspect);
          else newH = Math.round(newW / aspect);
        }
      }

      onCropChange({
        x: Math.max(0, Math.min(naturalWidth - 10, newX)),
        y: Math.max(0, Math.min(naturalHeight - 10, newY)),
        w: Math.max(10, Math.min(naturalWidth - newX, newW)),
        h: Math.max(10, Math.min(naturalHeight - newY, newH)),
      });
    };

    const handlePointerUp = () => {
      setDragMode(null);
      dragStartRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragMode, getAspectRatio, naturalHeight, naturalWidth, onCropChange, toNatural]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApplyCrop();
  };

  if (displayedWidth <= 0 || displayedHeight <= 0) return null;

  // Even-odd path: dims everything outside the crop box.
  const maskPath = `M 0 0 H ${displayedWidth} V ${displayedHeight} H 0 Z M ${boxX} ${boxY} V ${boxY + boxH} H ${boxX + boxW} V ${boxY} Z`;

  const handles: [DragMode, string][] = [
    ["handle-nw", styles.nw],
    ["handle-ne", styles.ne],
    ["handle-se", styles.se],
    ["handle-sw", styles.sw],
    ["handle-n", styles.n],
    ["handle-s", styles.s],
    ["handle-w", styles.w],
    ["handle-e", styles.e],
  ];

  return (
    <div
      ref={containerRef}
      className={styles.root}
      style={{ width: displayedWidth, height: displayedHeight }}
      onPointerDown={(e) => handlePointerDown(e, "create")}
    >
      <svg className={styles.shroud}>
        <path d={maskPath} fillRule="evenodd" />
      </svg>

      <div
        className={styles.box}
        style={{ left: boxX, top: boxY, width: boxW, height: boxH }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
        onDoubleClick={handleDoubleClick}
      >
        <div className={mergeClasses(styles.grid, dragMode !== null && styles.gridActive)}>
          <div className={mergeClasses(styles.lineV, styles.third1V)} />
          <div className={mergeClasses(styles.lineV, styles.third2V)} />
          <div className={mergeClasses(styles.lineH, styles.third1H)} />
          <div className={mergeClasses(styles.lineH, styles.third2H)} />
        </div>

        {handles.map(([mode, position]) => (
          <div key={mode} className={mergeClasses(styles.handle, position)} onPointerDown={(e) => handlePointerDown(e, mode)} />
        ))}

        <div className={mergeClasses(styles.pill, boxY > 30 ? styles.pillAbove : styles.pillInside)}>
          {crop.w} × {crop.h} px
        </div>

        <div
          className={mergeClasses(styles.toolbar, boxY + boxH + 40 < displayedHeight ? styles.toolbarBelow : styles.toolbarInside)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Tooltip content={`${t("imageTools.cropApply")} (Enter)`} relationship="label">
            <Button
              size="small"
              appearance="primary"
              icon={<Checkmark16Filled />}
              onClick={(e) => {
                e.stopPropagation();
                onApplyCrop();
              }}
            >
              {t("imageTools.cropApply")}
            </Button>
          </Tooltip>

          <Tooltip content={`${t("imageTools.cropCancel")} (Esc)`} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<Dismiss16Regular />}
              onClick={(e) => {
                e.stopPropagation();
                onCancelCrop();
              }}
            />
          </Tooltip>

          <Tooltip content={t("imageTools.cropReset")} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<ArrowReset24Regular />}
              onClick={(e) => {
                e.stopPropagation();
                onResetCrop();
              }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

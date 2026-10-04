import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Tooltip, tokens } from "@fluentui/react-components";
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
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag interaction state
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

  // Current crop in screen pixels
  const boxX = toScreen(crop.x);
  const boxY = toScreen(crop.y);
  const boxW = Math.max(1, toScreen(crop.w));
  const boxH = Math.max(1, toScreen(crop.h));

  // Determine aspect ratio constraint
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
      // Start a fresh box from the pointer location
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
        // Move entire crop box
        newX = Math.max(0, Math.min(naturalWidth - init.w, init.x + deltaX));
        newY = Math.max(0, Math.min(naturalHeight - init.h, init.y + deltaY));
      } else if (dragMode === "create") {
        // Creating a new box from initial click point
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
        // Resize via handles
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

        // Keep within bounds
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

  // Handle double-click inside box to apply crop
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApplyCrop();
  };

  if (displayedWidth <= 0 || displayedHeight <= 0) return null;

  // SVG mask path with fillRule="evenodd" to dim outside and keep inside transparent
  const maskPath = `
    M 0 0
    H ${displayedWidth}
    V ${displayedHeight}
    H 0
    Z
    M ${boxX} ${boxY}
    V ${boxY + boxH}
    H ${boxX + boxW}
    V ${boxY}
    Z
  `;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${displayedWidth}px`,
        height: `${displayedHeight}px`,
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none",
        overflow: "hidden",
      }}
      onPointerDown={(e) => handlePointerDown(e, "create")}
    >
      {/* SVG Shroud (Dark overlay outside crop box) */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <path d={maskPath} fill="rgba(0, 0, 0, 0.58)" fillRule="evenodd" />
      </svg>

      {/* The Active Crop Box */}
      <div
        style={{
          position: "absolute",
          left: `${boxX}px`,
          top: `${boxY}px`,
          width: `${boxW}px`,
          height: `${boxH}px`,
          boxSizing: "border-box",
          border: "1.5px solid #ffffff",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.3)",
          cursor: "move",
        }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
        onDoubleClick={handleDoubleClick}
      >
        {/* Rule of Thirds Grid (3x3) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: dragMode ? 0.75 : 0.45,
            transition: "opacity 0.15s ease",
          }}
        >
          {/* Vertical grid lines */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "33.33%",
              width: "1px",
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              boxShadow: "0 0 1px rgba(0,0,0,0.8)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "66.66%",
              width: "1px",
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              boxShadow: "0 0 1px rgba(0,0,0,0.8)",
            }}
          />
          {/* Horizontal grid lines */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "33.33%",
              height: "1px",
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              boxShadow: "0 0 1px rgba(0,0,0,0.8)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "66.66%",
              height: "1px",
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              boxShadow: "0 0 1px rgba(0,0,0,0.8)",
            }}
          />
        </div>

        {/* 8 Resize Handles */}
        {/* Corners */}
        <div
          style={{ ...handleBaseStyle, top: "-5px", left: "-5px", cursor: "nwse-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-nw")}
        />
        <div
          style={{ ...handleBaseStyle, top: "-5px", right: "-5px", cursor: "nesw-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-ne")}
        />
        <div
          style={{ ...handleBaseStyle, bottom: "-5px", right: "-5px", cursor: "nwse-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-se")}
        />
        <div
          style={{ ...handleBaseStyle, bottom: "-5px", left: "-5px", cursor: "nesw-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-sw")}
        />

        {/* Edges */}
        <div
          style={{ ...handleBaseStyle, top: "-5px", left: "calc(50% - 5px)", cursor: "ns-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-n")}
        />
        <div
          style={{ ...handleBaseStyle, bottom: "-5px", left: "calc(50% - 5px)", cursor: "ns-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-s")}
        />
        <div
          style={{ ...handleBaseStyle, top: "calc(50% - 5px)", left: "-5px", cursor: "ew-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-w")}
        />
        <div
          style={{ ...handleBaseStyle, top: "calc(50% - 5px)", right: "-5px", cursor: "ew-resize" }}
          onPointerDown={(e) => handlePointerDown(e, "handle-e")}
        />

        {/* Dimension Pill (Floating at top-left inside or above crop box) */}
        <div
          style={{
            position: "absolute",
            top: boxY > 30 ? "-28px" : "6px",
            left: "6px",
            backgroundColor: "rgba(18, 18, 18, 0.85)",
            backdropFilter: "blur(6px)",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: tokens.borderRadiusSmall,
            boxShadow: tokens.shadow4,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          {crop.w} × {crop.h} px
        </div>

        {/* Floating Mini Action Toolbar (Apply / Cancel buttons right below crop box) */}
        <div
          style={{
            position: "absolute",
            bottom: boxY + boxH + 40 < displayedHeight ? "-38px" : "8px",
            right: "8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            backgroundColor: "rgba(18, 18, 18, 0.9)",
            backdropFilter: "blur(8px)",
            padding: "3px 6px",
            borderRadius: tokens.borderRadiusMedium,
            boxShadow: tokens.shadow8,
            zIndex: 20,
          }}
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

const handleBaseStyle: React.CSSProperties = {
  position: "absolute",
  width: "10px",
  height: "10px",
  backgroundColor: "#ffffff",
  border: "1.5px solid #111111",
  borderRadius: "2px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.5)",
  boxSizing: "border-box",
  zIndex: 15,
};

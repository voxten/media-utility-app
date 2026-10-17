import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Dropdown,
  makeStyles,
  Option,
  Spinner,
  Subtitle2,
  Tab,
  TabList,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowForward16Regular,
  Copy16Regular,
  Delete16Regular,
  FolderOpen16Regular,
  Image24Regular,
  Save16Regular,
  Sparkle16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { api } from "../../lib/bridge";
import { allFilesFilter, dialogFilter, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";
import { AfterGallery } from "../../components/AfterGallery";
import { ResultCard } from "../../components/ResultCard";

import { ImageCanvasStage } from "./ImageCanvasStage";
import { ImageToolbox } from "./ImageToolbox";
import { ToolOptionsBar } from "./ToolOptionsBar";
import type { CropRect } from "./InteractiveCropOverlay";
import {
  type ActiveTool,
  type BatchResult,
  type ImageOperations,
  type PreviewData,
  type TransformResult,
  createDefaultOperations,
} from "./types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    height: "100%",
  },
  studioLayout: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
  },
  stageContainer: {
    display: "flex",
    gap: "12px",
    alignItems: "stretch",
    width: "100%",
    minHeight: "480px",
    height: "calc(64vh)",
  },
  canvasWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    boxSizing: "border-box",
  },
  canvasHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    minWidth: 0,
  },
  fileNameText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  statsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    padding: "6px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  filmstripPane: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px 16px",
    width: "100%",
    boxSizing: "border-box",
  },
  filmstripHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "nowrap",
    minHeight: "36px",
  },
  filmstripActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
    marginLeft: "auto",
  },
  filmstripListWrapper: {
    display: "flex",
    width: "100%",
    overflowX: "auto",
    padding: "6px 0 10px 0",
    scrollbarWidth: "thin",
  },
  filmstripTrack: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "0 auto", // Centers items when fewer than viewport width, scrolls smoothly when overflowing
    padding: "0 8px",
    minWidth: "max-content",
  },
  filmstripCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "116px",
    height: "122px",
    minWidth: "116px",
    padding: "6px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "all 0.15s ease",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
      transform: "translateY(-2px)",
      boxShadow: tokens.shadow4,
    },
  },
  filmstripCardActive: {
    outline: `2px solid ${tokens.colorCompoundBrandStroke}`,
    boxShadow: `0 0 0 2px ${tokens.colorCompoundBrandStroke}, ${tokens.shadow8}`,
    backgroundColor: tokens.colorNeutralBackground2Selected,
  },
  filmstripThumbBox: {
    width: "100%",
    height: "76px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: "6px",
    position: "relative",
  },
  filmstripImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
    userSelect: "none",
  },
  filmstripCardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "4px",
    marginTop: "auto",
    width: "100%",
  },
  filmstripCardTitle: {
    fontSize: "11px",
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexGrow: 1,
    minWidth: 0,
  },
  filmstripCardDelete: {
    position: "absolute",
    top: "3px",
    right: "3px",
    width: "20px",
    height: "20px",
    minWidth: "20px",
    padding: "0",
    backgroundColor: "rgba(20, 20, 20, 0.75)",
    backdropFilter: "blur(4px)",
    color: "#fff",
    borderRadius: "50%",
    opacity: 0.75,
    zIndex: 2,
    transition: "opacity 0.15s ease, background-color 0.15s ease",
    ":hover": {
      opacity: 1,
      backgroundColor: tokens.colorPaletteRedBackground3,
      color: "#fff",
    },
  },
});

export default function ImageToolsPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("image_tools")!;

  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");

  // Single file state
  const [singleFile, setSingleFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [transformed, setTransformed] = useState<TransformResult | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>("crop");
  const [singleOps, setSingleOps] = useState<ImageOperations>(createDefaultOperations());
  const [currentCrop, setCurrentCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [lastSavedSingle, setLastSavedSingle] = useState<{ outPath: string; width: number; height: number; bytes: number } | null>(null);

  // Batch state
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState(0);
  const [batchPreview, setBatchPreview] = useState<PreviewData | null>(null);
  const [batchTransformed, setBatchTransformed] = useState<TransformResult | null>(null);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [batchActiveTool, setBatchActiveTool] = useState<ActiveTool>("crop");
  const [batchFormat, setBatchFormat] = useState<string>("original");
  const [batchOps, setBatchOps] = useState<Record<string, ImageOperations>>({});
  const [batchCrop, setBatchCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [batchThumbnails, setBatchThumbnails] = useState<Record<string, string>>({});
  const pendingThumbsRef = useRef<Set<string>>(new Set());

  // Timers
  const singleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Job Runner for batch processing
  const batchJob = useJobRunner<BatchResult>("image_editor", {
    onDone: (res) =>
      notify.success(t("imageTools.toast.batchSuccess", { count: res.processed }), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(res.outputDir).catch(() => undefined),
        },
      }),
    onError: (err) => notify.error(t("imageTools.toast.error"), { body: err }),
  });

  // Convert ImageOperations into backend dictionary
  const compileBackendOps = useCallback((ops: ImageOperations, origW: number, origH: number): Record<string, unknown> => {
    const res: Record<string, unknown> = {};

    // 1. Crop
    if (ops.cropActive && ops.cropW > 0 && ops.cropH > 0) {
      if (ops.cropW < origW || ops.cropH < origH || ops.cropX > 0 || ops.cropY > 0) {
        res.crop = {
          x: Math.max(0, ops.cropX),
          y: Math.max(0, ops.cropY),
          width: Math.min(origW - ops.cropX, ops.cropW),
          height: Math.min(origH - ops.cropY, ops.cropH),
        };
      }
    }

    // 2. Rotate
    if (ops.rotation !== 0) {
      res.rotate = ops.rotation;
    }

    // 3. Flip
    if (ops.flipH) res.flip_h = true;
    if (ops.flipV) res.flip_v = true;

    // 4. Resize
    if (ops.resizeActive) {
      if (ops.scalePercent != null && ops.scalePercent > 0 && ops.scalePercent !== 100) {
        res.resize = { percent: ops.scalePercent, filter: ops.filter || "lanczos" };
      } else if (ops.targetWidth && ops.targetHeight && (ops.targetWidth !== origW || ops.targetHeight !== origH)) {
        res.resize = {
          width: ops.targetWidth,
          height: ops.targetHeight,
          filter: ops.filter || "lanczos",
        };
      }
    }

    return res;
  }, []);

  /* ==================== SINGLE FILE LOGIC ==================== */

  const loadSingleFile = async (filePath: string) => {
    try {
      setIsUpdating(true);
      setLastSavedSingle(null);
      const data = await api.image_editor.loadPreview(filePath);
      setSingleFile(filePath);
      setPreview(data);
      const initialOps = createDefaultOperations(data.width, data.height);
      setSingleOps(initialOps);
      setCurrentCrop({ x: 0, y: 0, w: data.width, h: data.height });
      setActiveTool("crop");
      setTransformed({
        width: data.width,
        height: data.height,
        hasAlpha: data.hasAlpha,
        dataUrl: data.dataUrl,
      });
    } catch (e) {
      notify.error(String(e));
    } finally {
      setIsUpdating(false);
    }
  };

  const openTransferModal = useTransferStore((s) => s.openModal);

  // Consume incoming file transfers from other tools
  useIncomingTransfer("image_tools", (files) => {
    if (files.length > 1) {
      setActiveTab("batch");
      setBatchFiles(files);
      setSelectedBatchIndex(0);
    } else if (files[0]) {
      setActiveTab("single");
      loadSingleFile(files[0]);
    }
  });

  // Debounced update for single file preview
  useEffect(() => {
    if (!singleFile || !preview) return;
    if (singleTimerRef.current) clearTimeout(singleTimerRef.current);

    singleTimerRef.current = setTimeout(async () => {
      try {
        setIsUpdating(true);
        const ops = compileBackendOps(singleOps, preview.width, preview.height);
        const res = await api.image_editor.previewTransform(singleFile, ops);
        setTransformed(res);
      } catch {
        // Ignore preview failure
      } finally {
        setIsUpdating(false);
      }
    }, 150);

    return () => {
      if (singleTimerRef.current) clearTimeout(singleTimerRef.current);
    };
  }, [singleFile, preview, singleOps, compileBackendOps]);

  // Single file Crop handlers
  const handleApplySingleCrop = () => {
    if (!preview) return;
    setSingleOps((prev) => ({
      ...prev,
      cropActive: true,
      cropX: currentCrop.x,
      cropY: currentCrop.y,
      cropW: currentCrop.w,
      cropH: currentCrop.h,
    }));
    notify.success(t("imageTools.cropAppliedToast"));
    setActiveTool("select");
  };

  const handleCancelSingleCrop = () => {
    if (!preview) return;
    setCurrentCrop({
      x: singleOps.cropActive ? singleOps.cropX : 0,
      y: singleOps.cropActive ? singleOps.cropY : 0,
      w: singleOps.cropActive ? singleOps.cropW : preview.width,
      h: singleOps.cropActive ? singleOps.cropH : preview.height,
    });
    setActiveTool("select");
  };

  const handleResetSingleCrop = () => {
    if (!preview) return;
    setSingleOps((prev) => ({
      ...prev,
      cropActive: false,
      cropPreset: "free",
      cropX: 0,
      cropY: 0,
      cropW: preview.width,
      cropH: preview.height,
    }));
    setCurrentCrop({ x: 0, y: 0, w: preview.width, h: preview.height });
  };

  const handleSingleCropPresetChange = (preset: string) => {
    if (!preview) return;
    let targetRatio: number | null = null;
    if (preset === "1_1") targetRatio = 1;
    else if (preset === "16_9") targetRatio = 16 / 9;
    else if (preset === "9_16") targetRatio = 9 / 16;
    else if (preset === "4_3") targetRatio = 4 / 3;
    else if (preset === "3_2") targetRatio = 3 / 2;

    setSingleOps((prev) => ({ ...prev, cropPreset: preset }));

    if (targetRatio) {
      let newW = preview.width;
      let newH = Math.round(newW / targetRatio);
      if (newH > preview.height) {
        newH = preview.height;
        newW = Math.round(newH * targetRatio);
      }
      const newX = Math.round((preview.width - newW) / 2);
      const newY = Math.round((preview.height - newH) / 2);
      setCurrentCrop({ x: newX, y: newY, w: newW, h: newH });
    }
  };

  const handleSingleReset = () => {
    if (!preview) return;
    setSingleOps(createDefaultOperations(preview.width, preview.height));
    setCurrentCrop({ x: 0, y: 0, w: preview.width, h: preview.height });
  };

  const handleCopyClipboard = async () => {
    if (!transformed?.dataUrl) return;
    try {
      const res = await fetch(transformed.dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      notify.success(t("imageTools.copied"));
    } catch {
      notify.error(t("imageTools.toast.copyError"));
    }
  };

  const handleSaveSingle = async () => {
    if (!singleFile || !preview) return;
    const ext = preview.format.toLowerCase() === "jpeg" ? "jpg" : preview.format.toLowerCase();
    const defaultName = `${fileName(singleFile).replace(/\.[^.]+$/, "")}_edited.${ext}`;
    const outPath = await api.dialogs.saveFile(defaultName, [dialogFilter(t, "images", [`.${ext}`]), allFilesFilter(t)]);
    if (!outPath) return;

    try {
      const ops = compileBackendOps(singleOps, preview.width, preview.height);
      const res = await api.image_editor.saveTransformed(singleFile, outPath, ops);
      setLastSavedSingle(res);
      notify.success(t("imageTools.toast.saveSuccess"), {
        body: res.outPath,
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(res.outPath).catch(() => undefined),
        },
      });
    } catch (e) {
      notify.error(String(e));
    }
  };

  /* ==================== BATCH PROCESSING LOGIC ==================== */

  const currentBatchFile = batchFiles[selectedBatchIndex] || null;

  const getCurrentFileOps = useCallback((file: string | null, w = 0, h = 0): ImageOperations => {
    if (!file) return createDefaultOperations();
    return batchOps[file] || createDefaultOperations(w, h);
  }, [batchOps]);

  const updateCurrentBatchOps = (updater: (prev: ImageOperations) => ImageOperations) => {
    if (!currentBatchFile) return;
    setBatchOps((prev) => {
      const existing = prev[currentBatchFile] || createDefaultOperations(batchPreview?.width, batchPreview?.height);
      return {
        ...prev,
        [currentBatchFile]: updater(existing),
      };
    });
  };

  const handleSelectBatchFile = (idx: number) => {
    if (idx === selectedBatchIndex && batchPreview) return;
    setSelectedBatchIndex(idx);
    setIsBatchLoading(true);
    setBatchTransformed(null);
  };

  // When active batch file changes, load preview data
  useEffect(() => {
    if (!batchFiles.length) {
      setBatchPreview(null);
      setBatchTransformed(null);
      setIsBatchLoading(false);
      return;
    }

    const targetFile = batchFiles[selectedBatchIndex] || batchFiles[0];
    if (!targetFile) return;

    let isCurrent = true;
    setIsBatchLoading(true);

    api.image_editor
      .loadPreview(targetFile)
      .then((data) => {
        if (!isCurrent) return;
        setBatchPreview(data);
        if (data.dataUrl) {
          setBatchThumbnails((prev) => (prev[targetFile] ? prev : { ...prev, [targetFile]: data.dataUrl }));
        }

        setBatchOps((prev) => {
          if (!prev[targetFile]) {
            return {
              ...prev,
              [targetFile]: createDefaultOperations(data.width, data.height),
            };
          }
          return prev;
        });

        const currentOps = batchOps[targetFile] || createDefaultOperations(data.width, data.height);
        setBatchCrop({
          x: currentOps.cropActive ? currentOps.cropX : 0,
          y: currentOps.cropActive ? currentOps.cropY : 0,
          w: currentOps.cropActive ? currentOps.cropW : data.width,
          h: currentOps.cropActive ? currentOps.cropH : data.height,
        });

        const backendOps = compileBackendOps(currentOps, data.width, data.height);
        return api.image_editor.previewTransform(targetFile, backendOps);
      })
      .then((res) => {
        if (!isCurrent || !res) return;
        setBatchTransformed(res);
      })
      .catch((e) => {
        if (isCurrent) notify.error(String(e));
      })
      .finally(() => {
        if (isCurrent) setIsBatchLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [batchFiles, selectedBatchIndex, compileBackendOps]);

  // Preload batch thumbnails for carousel filmstrip
  useEffect(() => {
    if (!batchFiles.length) {
      setBatchThumbnails({});
      pendingThumbsRef.current.clear();
      return;
    }

    let isCurrent = true;
    const toLoad = batchFiles.filter((f) => !batchThumbnails[f] && !pendingThumbsRef.current.has(f));
    toLoad.forEach((f) => {
      pendingThumbsRef.current.add(f);
      api.image_editor
        .loadPreview(f)
        .then((data) => {
          if (isCurrent && data?.dataUrl) {
            setBatchThumbnails((prev) => ({ ...prev, [f]: data.dataUrl }));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          pendingThumbsRef.current.delete(f);
        });
    });

    return () => {
      isCurrent = false;
    };
  }, [batchFiles, batchThumbnails]);

  // Debounced update when batch ops change
  useEffect(() => {
    if (!currentBatchFile || !batchPreview) return;
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);

    batchTimerRef.current = setTimeout(async () => {
      try {
        setIsBatchUpdating(true);
        const ops = getCurrentFileOps(currentBatchFile, batchPreview.width, batchPreview.height);
        const backendOps = compileBackendOps(ops, batchPreview.width, batchPreview.height);
        const res = await api.image_editor.previewTransform(currentBatchFile, backendOps);
        setBatchTransformed(res);
      } catch {
        // Ignore
      } finally {
        setIsBatchUpdating(false);
      }
    }, 150);

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [batchOps, currentBatchFile, batchPreview, compileBackendOps, getCurrentFileOps]);

  const handleApplyBatchCrop = () => {
    if (!batchPreview || !currentBatchFile) return;
    updateCurrentBatchOps((prev) => ({
      ...prev,
      cropActive: true,
      cropX: batchCrop.x,
      cropY: batchCrop.y,
      cropW: batchCrop.w,
      cropH: batchCrop.h,
    }));
    notify.success(t("imageTools.cropAppliedToast"));
    setBatchActiveTool("select");
  };

  const handleCancelBatchCrop = () => {
    if (!batchPreview || !currentBatchFile) return;
    const ops = getCurrentFileOps(currentBatchFile, batchPreview.width, batchPreview.height);
    setBatchCrop({
      x: ops.cropActive ? ops.cropX : 0,
      y: ops.cropActive ? ops.cropY : 0,
      w: ops.cropActive ? ops.cropW : batchPreview.width,
      h: ops.cropActive ? ops.cropH : batchPreview.height,
    });
    setBatchActiveTool("select");
  };

  const handleResetBatchCrop = () => {
    if (!batchPreview || !currentBatchFile) return;
    updateCurrentBatchOps((prev) => ({
      ...prev,
      cropActive: false,
      cropPreset: "free",
      cropX: 0,
      cropY: 0,
      cropW: batchPreview.width,
      cropH: batchPreview.height,
    }));
    setBatchCrop({ x: 0, y: 0, w: batchPreview.width, h: batchPreview.height });
  };

  const handleBatchCropPresetChange = (preset: string) => {
    if (!batchPreview || !currentBatchFile) return;
    let targetRatio: number | null = null;
    if (preset === "1_1") targetRatio = 1;
    else if (preset === "16_9") targetRatio = 16 / 9;
    else if (preset === "9_16") targetRatio = 9 / 16;
    else if (preset === "4_3") targetRatio = 4 / 3;
    else if (preset === "3_2") targetRatio = 3 / 2;

    updateCurrentBatchOps((prev) => ({ ...prev, cropPreset: preset }));

    if (targetRatio) {
      let newW = batchPreview.width;
      let newH = Math.round(newW / targetRatio);
      if (newH > batchPreview.height) {
        newH = batchPreview.height;
        newW = Math.round(newH * targetRatio);
      }
      const newX = Math.round((batchPreview.width - newW) / 2);
      const newY = Math.round((batchPreview.height - newH) / 2);
      setBatchCrop({ x: newX, y: newY, w: newW, h: newH });
    }
  };

  const handleBatchResetCurrent = () => {
    if (!currentBatchFile || !batchPreview) return;
    setBatchOps((prev) => ({
      ...prev,
      [currentBatchFile]: createDefaultOperations(batchPreview.width, batchPreview.height),
    }));
    setBatchCrop({ x: 0, y: 0, w: batchPreview.width, h: batchPreview.height });
  };

  const handleApplyToAll = () => {
    if (!currentBatchFile) return;
    const current = batchOps[currentBatchFile] || createDefaultOperations(batchPreview?.width, batchPreview?.height);
    const nextMap: Record<string, ImageOperations> = {};
    for (const file of batchFiles) {
      nextMap[file] = { ...current };
    }
    setBatchOps(nextMap);
    notify.success(t("imageTools.appliedToAll"));
  };

  const handleBatchStart = async () => {
    if (!batchFiles.length) return;
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;

    const perFileOps: Record<string, Record<string, unknown>> = {};
    for (const f of batchFiles) {
      const ops = batchOps[f];
      if (ops) {
        const origW = ops.targetWidth || 0;
        const origH = ops.targetHeight || 0;
        perFileOps[f] = compileBackendOps(ops, origW, origH);
      } else {
        perFileOps[f] = {};
      }
    }

    const fmt = batchFormat === "original" ? undefined : batchFormat;
    batchJob.start(() => api.image_editor.startBatch(batchFiles, outDir, perFileOps, fmt)).catch((e) => notify.error(String(e)));
  };

  // Keyboard Shortcuts (C, R, T, V, Enter, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (activeTab === "single" && preview) {
        if (e.key === "c" || e.key === "C") {
          setActiveTool("crop");
        } else if (e.key === "r" || e.key === "R") {
          setActiveTool("resize");
        } else if (e.key === "t" || e.key === "T") {
          setActiveTool("transform");
        } else if (e.key === "v" || e.key === "V") {
          setActiveTool("select");
        } else if (e.key === "Enter" && activeTool === "crop") {
          handleApplySingleCrop();
        } else if (e.key === "Escape" && activeTool === "crop") {
          handleCancelSingleCrop();
        }
      } else if (activeTab === "batch" && batchPreview) {
        if (e.key === "c" || e.key === "C") {
          setBatchActiveTool("crop");
        } else if (e.key === "r" || e.key === "R") {
          setBatchActiveTool("resize");
        } else if (e.key === "t" || e.key === "T") {
          setBatchActiveTool("transform");
        } else if (e.key === "v" || e.key === "V") {
          setBatchActiveTool("select");
        } else if (e.key === "Enter" && batchActiveTool === "crop") {
          handleApplyBatchCrop();
        } else if (e.key === "Escape" && batchActiveTool === "crop") {
          handleCancelBatchCrop();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, preview, batchPreview, activeTool, batchActiveTool, currentCrop, batchCrop]);

  const activeBatchOps = getCurrentFileOps(currentBatchFile, batchPreview?.width, batchPreview?.height);

  return (
    <Page title={t("tools.image_tools.name")} description={t("tools.image_tools.description")} icon={tool.icon} accent={tool.accent}>
      <div className={styles.container}>
        <TabList selectedValue={activeTab} onTabSelect={(_, d) => setActiveTab(d.value as "single" | "batch")}>
          <Tab value="single" icon={<Sparkle16Regular />}>
            {t("imageTools.tabs.single")}
          </Tab>
          <Tab value="batch" icon={<FolderOpen16Regular />}>
            {t("imageTools.tabs.batch")}
          </Tab>
        </TabList>

        {activeTab === "single" ? (
          !preview ? (
            <DropZone
              icon={Image24Regular}
              title={t("imageTools.dropSingleTitle")}
              hint={t("imageTools.dropSingleHint")}
              accept={IMAGE_EXTENSIONS}
              onFiles={(files) => files[0] && loadSingleFile(files[0])}
              onBrowse={async () => {
                const files = await api.dialogs.openFiles([dialogFilter(t, "images")], false);
                if (files[0]) loadSingleFile(files[0]);
              }}
            />
          ) : (
            <div className={styles.studioLayout}>
              {/* Dynamic Contextual Tool Options Bar */}
              <ToolOptionsBar
                activeTool={activeTool}
                ops={singleOps}
                naturalWidth={preview.width}
                naturalHeight={preview.height}
                onOpsChange={setSingleOps}
                onCropPresetChange={handleSingleCropPresetChange}
              />

              {/* Main Studio Area: Toolbox on Left + Canvas Stage on Right */}
              <div className={styles.stageContainer}>
                {/* Przybornik (Studio Toolbox) */}
                <ImageToolbox
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  onReset={handleSingleReset}
                />

                {/* Hero Viewport Canvas Stage */}
                <div className={styles.canvasWrapper}>
                  <div className={styles.canvasHeader}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <Image24Regular />
                      <Subtitle2 className={styles.fileNameText}>{preview.fileName}</Subtitle2>
                      <Caption1 className={styles.muted}>
                        {preview.width} × {preview.height} px · {preview.format.toUpperCase()} · {formatBytes(preview.size)}
                        {transformed && (transformed.width !== preview.width || transformed.height !== preview.height) && (
                          <span> ➔ {transformed.width} × {transformed.height} px</span>
                        )}
                      </Caption1>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {isUpdating && <Spinner size="tiny" label={t("common.loading")} />}
                      {singleFile && (
                        <Button
                          appearance="subtle"
                          icon={<ArrowForward16Regular />}
                          onClick={() => openTransferModal(singleFile, "image_tools")}
                          title={t("transfer.buttonTooltip")}
                        >
                          {t("transfer.button")}
                        </Button>
                      )}
                      <Button appearance="subtle" icon={<Copy16Regular />} onClick={handleCopyClipboard}>
                        {t("imageTools.copyClipboard")}
                      </Button>
                      <Button
                        appearance="subtle"
                        icon={<Delete16Regular />}
                        onClick={() => {
                          setSingleFile(null);
                          setPreview(null);
                          setTransformed(null);
                          setLastSavedSingle(null);
                        }}
                      >
                        {t("common.clearAll")}
                      </Button>
                    </div>
                  </div>

                  <ImageCanvasStage
                    imageSrc={activeTool === "crop" ? preview.dataUrl : (transformed?.dataUrl ?? preview.dataUrl)}
                    naturalWidth={preview.width}
                    naturalHeight={preview.height}
                    activeTool={activeTool}
                    crop={currentCrop}
                    cropPreset={singleOps.cropPreset}
                    isLoading={isUpdating}
                    onCropChange={setCurrentCrop}
                    onApplyCrop={handleApplySingleCrop}
                    onCancelCrop={handleCancelSingleCrop}
                    onResetCrop={handleResetSingleCrop}
                  />

                  {/* Informative Stats Footer Bar */}
                  <div className={styles.statsBar}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Caption1>{t("imageTools.width")}:</Caption1>
                      <Text weight="semibold">{transformed?.width ?? preview.width} px</Text>
                      <Caption1 style={{ marginLeft: "12px" }}>{t("imageTools.height")}:</Caption1>
                      <Text weight="semibold">{transformed?.height ?? preview.height} px</Text>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {singleOps.cropActive && <Badge color="brand">Crop: {singleOps.cropW}×{singleOps.cropH}</Badge>}
                      {singleOps.rotation !== 0 && <Badge color="informative">{singleOps.rotation}°</Badge>}
                      {singleOps.flipH && <Badge color="informative">Flip H</Badge>}
                      {singleOps.flipV && <Badge color="informative">Flip V</Badge>}
                    </div>
                  </div>
                </div>

                {lastSavedSingle && (
                  <ResultCard
                    title={t("transfer.savedTitle")}
                    detail={`${lastSavedSingle.width}×${lastSavedSingle.height} px · ${formatBytes(lastSavedSingle.bytes)}`}
                    path={lastSavedSingle.outPath}
                    sourceToolId="image_tools"
                  />
                )}
              </div>

              {/* Bottom Action Bar */}
              <ActionBar idleText={`${transformed?.width ?? preview.width} × ${transformed?.height ?? preview.height} px`}>
                <Button appearance="subtle" icon={<Copy16Regular />} onClick={handleCopyClipboard}>
                  {t("imageTools.copyClipboard")}
                </Button>
                <Button appearance="primary" icon={<Save16Regular />} onClick={handleSaveSingle}>
                  {t("imageTools.saveAction")}
                </Button>
              </ActionBar>
            </div>
          )
        ) : (
          /* ==================== BATCH PROCESSING TAB ==================== */
          <div className={styles.studioLayout}>
            {!batchFiles.length ? (
              <DropZone
                icon={FolderOpen16Regular}
                title={t("imageTools.dropBatchTitle")}
                hint={t("imageTools.dropBatchHint")}
                accept={IMAGE_EXTENSIONS}
                onFiles={(files) => {
                  setBatchFiles(files);
                  setSelectedBatchIndex(0);
                }}
                onBrowse={async () => {
                  const files = await api.dialogs.openFiles([dialogFilter(t, "images")], true);
                  if (files.length) {
                    setBatchFiles(files);
                    setSelectedBatchIndex(0);
                  }
                }}
              />
            ) : (
              <div className={styles.studioLayout}>
                {/* Dynamic Contextual Tool Options Bar */}
                {batchPreview && (
                  <ToolOptionsBar
                    activeTool={batchActiveTool}
                    ops={activeBatchOps}
                    naturalWidth={batchPreview.width}
                    naturalHeight={batchPreview.height}
                    onOpsChange={(updater) => updateCurrentBatchOps(updater)}
                    onCropPresetChange={handleBatchCropPresetChange}
                  />
                )}

                {/* Main Studio Area: Toolbox on Left + Canvas Stage on Right (100% width, full space) */}
                <div className={styles.stageContainer}>
                  <ImageToolbox
                    activeTool={batchActiveTool}
                    onSelectTool={setBatchActiveTool}
                    onReset={handleBatchResetCurrent}
                    disabled={!batchPreview}
                  />

                  <div className={styles.canvasWrapper}>
                    <div className={styles.canvasHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <Image24Regular />
                        <Subtitle2 className={styles.fileNameText}>
                          {currentBatchFile ? fileName(currentBatchFile) : t("imageTools.selectedFile")}
                        </Subtitle2>
                        {batchPreview && (
                          <Caption1 className={styles.muted}>
                            {batchPreview.width} × {batchPreview.height} px · {batchPreview.format.toUpperCase()} · {formatBytes(batchPreview.size)}
                            {batchTransformed && (batchTransformed.width !== batchPreview.width || batchTransformed.height !== batchPreview.height) && (
                              <span> ➔ {batchTransformed.width} × {batchTransformed.height} px</span>
                            )}
                          </Caption1>
                        )}
                      </div>

                      {isBatchUpdating && <Spinner size="tiny" label={t("common.loading")} />}
                    </div>

                    {batchPreview ? (
                      <ImageCanvasStage
                        imageSrc={batchActiveTool === "crop" ? batchPreview.dataUrl : (batchTransformed?.dataUrl ?? batchPreview.dataUrl)}
                        naturalWidth={batchPreview.width}
                        naturalHeight={batchPreview.height}
                        activeTool={batchActiveTool}
                        crop={batchCrop}
                        cropPreset={activeBatchOps.cropPreset}
                        isLoading={isBatchLoading || isBatchUpdating}
                        onCropChange={setBatchCrop}
                        onApplyCrop={handleApplyBatchCrop}
                        onCancelCrop={handleCancelBatchCrop}
                        onResetCrop={handleResetBatchCrop}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        <Spinner label={t("common.loading")} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Filmstrip / Karuzela miniatur bezpośrednio pod podglądem */}
                <div className={styles.filmstripPane}>
                  <div className={styles.filmstripHeader}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <Text weight="semibold">{t("imageTools.selectedFile")}</Text>
                      <Badge color="brand">{selectedBatchIndex + 1} / {batchFiles.length}</Badge>
                      <Button
                        size="small"
                        icon={<FolderOpen16Regular />}
                        onClick={async () => {
                          const files = await api.dialogs.openFiles([dialogFilter(t, "images")], true);
                          if (files.length) {
                            setBatchFiles((prev) => Array.from(new Set([...prev, ...files])));
                          }
                        }}
                      >
                        {t("common.browse")}
                      </Button>
                    </div>

                    <div className={styles.filmstripActions}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <Caption1 style={{ color: tokens.colorNeutralForeground2, whiteSpace: "nowrap" }}>
                          {t("compressor.format")}:
                        </Caption1>
                        <Dropdown
                          size="small"
                          style={{ width: "165px", minWidth: "165px" }}
                          value={batchFormat === "original" ? t("compressor.formatOriginal") : batchFormat.toUpperCase()}
                          selectedOptions={[batchFormat]}
                          onOptionSelect={(_, d) => setBatchFormat(d.optionValue as string)}
                        >
                          <Option value="original">{t("compressor.formatOriginal")}</Option>
                          <Option value="png">PNG</Option>
                          <Option value="jpeg">JPEG</Option>
                          <Option value="webp">WebP</Option>
                        </Dropdown>
                      </div>

                      <Button size="small" icon={<Copy16Regular />} onClick={handleApplyToAll} style={{ flexShrink: 0 }}>
                        {t("imageTools.applyToAll")}
                      </Button>

                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<ArrowForward16Regular />}
                        style={{ flexShrink: 0 }}
                        disabled={!currentBatchFile}
                        onClick={() => currentBatchFile && openTransferModal(currentBatchFile, "image_tools")}
                        title={t("transfer.buttonTooltip")}
                      >
                        {t("transfer.button")}
                      </Button>

                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<Delete16Regular />}
                        style={{ flexShrink: 0 }}
                        onClick={() => {
                          setBatchFiles([]);
                          setBatchOps({});
                          setBatchPreview(null);
                          setBatchTransformed(null);
                          setBatchThumbnails({});
                          batchJob.reset();
                        }}
                      >
                        {t("common.clearAll")}
                      </Button>
                    </div>
                  </div>

                  {/* Centered Scrollable Carousel List */}
                  <div className={styles.filmstripListWrapper}>
                    <div className={styles.filmstripTrack}>
                      {batchFiles.map((file, idx) => {
                        const isActive = idx === selectedBatchIndex;
                        const hasOps = !!batchOps[file] && (batchOps[file].resizeActive || batchOps[file].cropActive || batchOps[file].rotation !== 0 || batchOps[file].flipH || batchOps[file].flipV);
                        const thumbSrc = (isActive && batchTransformed?.dataUrl)
                          ? batchTransformed.dataUrl
                          : (batchThumbnails[file] || (isActive ? batchPreview?.dataUrl : undefined));

                        return (
                          <div
                            key={file}
                            className={`${styles.filmstripCard} ${isActive ? styles.filmstripCardActive : ""}`}
                            onClick={() => handleSelectBatchFile(idx)}
                          >
                            <div className={styles.filmstripThumbBox}>
                              {thumbSrc ? (
                                <img
                                  src={thumbSrc}
                                  className={styles.filmstripImg}
                                  alt={fileName(file)}
                                  loading="lazy"
                                />
                              ) : (
                                <Spinner size="extra-tiny" />
                              )}
                            </div>

                            <div className={styles.filmstripCardFooter}>
                              <Text size={200} weight={isActive ? "semibold" : "regular"} className={styles.filmstripCardTitle} title={fileName(file)}>
                                {fileName(file)}
                              </Text>
                              <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
                                <Caption1 className={styles.muted}>#{idx + 1}</Caption1>
                                {hasOps && <Badge size="tiny" color="informative" appearance="filled" />}
                              </div>
                            </div>

                            <Tooltip content={t("common.delete")} relationship="label">
                              <Button
                                className={styles.filmstripCardDelete}
                                size="small"
                                appearance="subtle"
                                icon={<Delete16Regular fontSize={12} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = batchFiles.filter((_, i) => i !== idx);
                                  setBatchFiles(next);
                                  if (selectedBatchIndex >= next.length) {
                                    setSelectedBatchIndex(Math.max(0, next.length - 1));
                                  }
                                }}
                              />
                            </Tooltip>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {batchJob.result && batchJob.result.results && batchJob.result.results.length > 0 && (
                  <AfterGallery
                    title={t("transfer.processedTitle")}
                    files={batchJob.result.files || batchJob.result.results.map((r) => r.dest)}
                    items={batchJob.result.results.map((r) => ({
                      file: r.file,
                      dest: r.dest,
                      name: fileName(r.dest),
                      size: r.bytes,
                      width: r.width,
                      height: r.height,
                    }))}
                    outputDir={batchJob.result.outputDir}
                    sourceToolId="image_tools"
                  />
                )}

                {/* Bottom Action Bar */}
                <ActionBar idleText={t("imageTools.processBatch", { count: batchFiles.length })}>
                  <Button
                    appearance="primary"
                    icon={<Save16Regular />}
                    disabled={!batchFiles.length}
                    onClick={handleBatchStart}
                  >
                    {t("imageTools.processBatch", { count: batchFiles.length })}
                  </Button>
                </ActionBar>
              </div>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

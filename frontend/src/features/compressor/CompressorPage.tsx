import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Card,
  Dropdown,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Subtitle2,
  Tab,
  TabList,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowForward16Regular,
  ArrowMinimize24Regular,
  Delete16Regular,
  Image24Regular,
  ImageEdit20Regular,
  Sparkle16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { ImageComparison } from "../../components/ImageComparison";
import { DropZone } from "../../components/DropZone";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { claimDrop, matchesExtensions } from "../../lib/drop";
import { dialogFilter, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";
import { AfterGallery } from "../../components/AfterGallery";
import { ResultCard } from "../../components/ResultCard";

interface PreviewData {
  path: string;
  fileName: string;
  size: number;
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  dataUrl: string;
}

interface CompressedPreview {
  compressedBytes: number;
  savedBytes: number;
  savedPercent: number;
  dataUrl: string;
}

interface BatchResult {
  total: number;
  processed: number;
  failed: number;
  inBytes: number;
  outBytes: number;
  savedBytes: number;
  savedPercent: number;
  outputDir: string;
  outPath?: string;
  files?: string[];
  results: {
    file: string;
    dest: string;
    inBytes: number;
    outBytes: number;
    savedPercent: number;
  }[];
}

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    height: "100%",
  },
  settingsCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
  },
  settingsTopRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  settingsBottomRow: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    gap: "24px",
    alignItems: "flex-start",
    paddingTop: "14px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    width: "100%",
    boxSizing: "border-box",
    "@media (max-width: 800px)": {
      gridTemplateColumns: "1fr",
      gap: "14px",
    },
  },
  formatField: {
    width: "100%",
  },
  modeParamContainer: {
    width: "100%",
    minWidth: 0,
  },
  losslessNotice: {
    display: "flex",
    alignItems: "center",
    height: "32px",
    padding: "0 14px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    width: "100%",
    boxSizing: "border-box",
  },
  targetRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    height: "32px",
    flexWrap: "wrap",
  },
  quickTargetRow: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  batchViewerHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    width: "100%",
  },
  batchViewerTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    minWidth: 0,
  },
  batchFileName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    flexGrow: 1,
  },
  viewerPane: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "16px",
    width: "100%",
    boxSizing: "border-box",
  },
  sliderContainer: {
    width: "100%",
    minHeight: "480px",
    maxHeight: "62vh",
    height: "560px",
    display: "grid",
    placeItems: "center",
    position: "relative",
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  statsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    padding: "10px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  statsGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  savedValue: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  batchGrid: {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: "16px",
    minHeight: "520px",
    "@media (max-width: 960px)": {
      gridTemplateColumns: "1fr",
    },
  },
  batchListPane: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "16px",
    overflow: "hidden",
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "360px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  fileItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "pointer",
    transitionProperty: "background-color, border-color",
    transitionDuration: tokens.durationFaster,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
  fileItemActive: {
    outline: `2px solid ${tokens.colorCompoundBrandStroke}`,
    backgroundColor: tokens.colorNeutralBackground2Selected,
  },
  name: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  muted: { color: tokens.colorNeutralForeground3 },
});

export default function CompressorPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("compressor")!;

  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");

  // Single file state
  const [singleFile, setSingleFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [compressedPreview, setCompressedPreview] = useState<CompressedPreview | null>(null);
  const [isUpdatingPreview, setIsUpdatingPreview] = useState(false);

  // Settings
  const [mode, setMode] = useState<"smart" | "lossless" | "target">("smart");
  const [format, setFormat] = useState<"original" | "webp" | "jpeg" | "png">("original");
  const [quality, setQuality] = useState(80);
  const [targetKb, setTargetKb] = useState("500");

  // Batch state
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState(0);
  const [batchPreview, setBatchPreview] = useState<PreviewData | null>(null);
  const [batchCompressedPreview, setBatchCompressedPreview] = useState<CompressedPreview | null>(null);
  const [isUpdatingBatchPreview, setIsUpdatingBatchPreview] = useState(false);

  // Job runner for compression
  const compressJob = useJobRunner<BatchResult>("compressor", {
    onDone: (result) => {
      notify.success(
        t("compressor.toast.batchSuccess", {
          count: result.processed,
          saved: formatBytes(result.savedBytes),
        }),
        {
          body: result.outputDir || result.outPath,
          action: {
            label: t("common.showInFolder"),
            onClick: () =>
              result.outputDir
                ? api.system.openPath(result.outputDir).catch(() => undefined)
                : api.system.reveal(result.outPath!).catch(() => undefined),
          },
        },
      );
    },
    onError: (err) => notify.error(t("compressor.toast.error"), { body: err }),
  });

  // Load preview when file changes (single mode)
  const loadSingleFile = useCallback(
    async (path: string) => {
      compressJob.reset();
      setSingleFile(path);
      try {
        const info = await api.compressor.loadPreview(path);
        setPreview(info);
      } catch (err) {
        notify.error(String(err));
      }
    },
    [notify, compressJob],
  );

  const openTransferModal = useTransferStore((s) => s.openModal);

  // Consume incoming file transfers from other tools
  useIncomingTransfer("compressor", (files) => {
    compressJob.reset();
    if (files.length > 1) {
      setActiveTab("batch");
      setBatchFiles(files);
      setSelectedBatchIndex(0);
    } else if (files[0]) {
      setActiveTab("single");
      loadSingleFile(files[0]);
    }
  });

  // Load preview for selected batch file
  const activeBatchPath = batchFiles[selectedBatchIndex] ?? null;
  useEffect(() => {
    if (!activeBatchPath || activeTab !== "batch") {
      setBatchPreview(null);
      setBatchCompressedPreview(null);
      return;
    }
    api.compressor
      .loadPreview(activeBatchPath)
      .then((info) => setBatchPreview(info))
      .catch(() => undefined);
  }, [activeBatchPath, activeTab]);

  // Update in-memory compressed preview for single file
  const updateSingleTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!singleFile || activeTab !== "single") return;

    if (updateSingleTimer.current) window.clearTimeout(updateSingleTimer.current);
    updateSingleTimer.current = window.setTimeout(async () => {
      setIsUpdatingPreview(true);
      try {
        const res = await api.compressor.preview(singleFile, {
          format,
          mode,
          quality,
          targetKb: mode === "target" ? Number(targetKb) || 500 : undefined,
        });
        setCompressedPreview(res);
      } catch (err) {
        console.warn("Compressor preview failed:", err);
      } finally {
        setIsUpdatingPreview(false);
      }
    }, 200);

    return () => {
      if (updateSingleTimer.current) window.clearTimeout(updateSingleTimer.current);
    };
  }, [singleFile, format, mode, quality, targetKb, activeTab]);

  // Update in-memory compressed preview for active batch file
  const updateBatchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!activeBatchPath || activeTab !== "batch") return;

    if (updateBatchTimer.current) window.clearTimeout(updateBatchTimer.current);
    updateBatchTimer.current = window.setTimeout(async () => {
      setIsUpdatingBatchPreview(true);
      try {
        const res = await api.compressor.preview(activeBatchPath, {
          format,
          mode,
          quality,
          targetKb: mode === "target" ? Number(targetKb) || 500 : undefined,
        });
        setBatchCompressedPreview(res);
      } catch (err) {
        console.warn("Batch compressor preview failed:", err);
      } finally {
        setIsUpdatingBatchPreview(false);
      }
    }, 200);

    return () => {
      if (updateBatchTimer.current) window.clearTimeout(updateBatchTimer.current);
    };
  }, [activeBatchPath, format, mode, quality, targetKb, activeTab]);

  const handleSingleSave = async () => {
    if (!singleFile) return;
    const ext = format === "original" ? fileName(singleFile).split(".").pop() || "png" : format;
    const defaultName = `${fileName(singleFile).replace(/\.[^.]+$/, "")}_compressed.${ext}`;
    const outPath = await api.dialogs.saveFile(defaultName, [`${ext.toUpperCase()} (*.${ext})`]);
    if (!outPath) return;

    compressJob.start(() =>
      api.compressor.start({
        path: singleFile,
        outPath,
        format,
        mode,
        quality,
        targetKb: mode === "target" ? Number(targetKb) || 500 : undefined,
      }),
    );
  };

  const handleBatchStart = async () => {
    if (!batchFiles.length) return;
    const outputDir = await api.dialogs.openFolder();
    if (!outputDir) return;

    compressJob.start(() =>
      api.compressor.start({
        files: batchFiles,
        outputDir,
        format,
        mode,
        quality,
        targetKb: mode === "target" ? Number(targetKb) || 500 : undefined,
      }),
    );
  };

  // Reusable Settings Bar
  const renderSettingsBar = () => (
    <Card className={styles.settingsCard}>
      <div className={styles.settingsTopRow}>
        <Subtitle2>{t("compressor.mode")}</Subtitle2>
        <RadioGroup
          layout="horizontal"
          value={mode}
          onChange={(_, d) => setMode(d.value as "smart" | "lossless" | "target")}
        >
          <Radio value="smart" label={t("compressor.modeSmart")} />
          <Radio value="lossless" label={t("compressor.modeLossless")} />
          <Radio value="target" label={t("compressor.modeTarget")} />
        </RadioGroup>
      </div>

      <div className={styles.settingsBottomRow}>
        <Field label={t("compressor.format")} className={styles.formatField}>
          <Dropdown
            value={
              format === "original"
                ? t("compressor.formatOriginal")
                : format === "webp"
                  ? t("compressor.formatWebp")
                  : format === "jpeg"
                    ? t("compressor.formatJpeg")
                    : t("compressor.formatPng")
            }
            selectedOptions={[format]}
            onOptionSelect={(_, d) => setFormat(d.optionValue as "original" | "webp" | "jpeg" | "png")}
            style={{ width: "100%" }}
          >
            <Option value="original">{t("compressor.formatOriginal")}</Option>
            <Option value="webp">{t("compressor.formatWebp")}</Option>
            <Option value="jpeg">{t("compressor.formatJpeg")}</Option>
            <Option value="png">{t("compressor.formatPng")}</Option>
          </Dropdown>
        </Field>

        <div className={styles.modeParamContainer}>
          {mode === "smart" && (
            <SliderField
              label={t("compressor.quality")}
              value={quality}
              min={20}
              max={100}
              step={1}
              format={(v) => `${v}%`}
              onChange={setQuality}
            />
          )}

          {mode === "target" && (
            <Field label={t("compressor.targetKb")}>
              <div className={styles.targetRow}>
                <Input
                  type="number"
                  value={targetKb}
                  placeholder={t("compressor.targetKbPlaceholder")}
                  onChange={(_, d) => setTargetKb(d.value)}
                  style={{ width: "130px" }}
                />
                <div className={styles.quickTargetRow}>
                  {["200", "500", "1000", "2000"].map((size) => (
                    <Button
                      key={size}
                      size="small"
                      appearance="subtle"
                      onClick={() => setTargetKb(size)}
                    >
                      {Number(size) >= 1000 ? `${Number(size) / 1000} MB` : `${size} KB`}
                    </Button>
                  ))}
                </div>
              </div>
            </Field>
          )}

          {mode === "lossless" && (
            <Field label={t("compressor.modeLossless")}>
              <div className={styles.losslessNotice}>
                <Caption1 className={styles.muted}>
                  {t("compressor.modeLosslessHint")}
                </Caption1>
              </div>
            </Field>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <Page title={t("tools.compressor.name")} description={t("tools.compressor.description")} icon={tool.icon} accent={tool.accent}>
      <div className={styles.container}>
        <TabList selectedValue={activeTab} onTabSelect={(_, d) => setActiveTab(d.value as "single" | "batch")}>
          <Tab value="single" icon={<Sparkle16Regular />}>
            {t("compressor.tabs.single")}
          </Tab>
          <Tab value="batch" icon={<ArrowMinimize24Regular />}>
            {t("compressor.tabs.batch")}
          </Tab>
        </TabList>

        {/* ==================== TAB: SINGLE FILE ==================== */}
        {activeTab === "single" ? (
          !preview ? (
            <DropZone
              icon={Image24Regular}
              title={t("compressor.dropSingleTitle")}
              hint={t("compressor.dropSingleHint")}
              accept={IMAGE_EXTENSIONS}
              onFiles={(files) => files[0] && loadSingleFile(files[0])}
              onBrowse={async () => {
                const files = await api.dialogs.openFiles([dialogFilter(t, "images")], false);
                if (files[0]) loadSingleFile(files[0]);
              }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Compression settings bar */}
              {renderSettingsBar()}

              {/* Full-width large comparison viewer */}
              <div
                className={styles.viewerPane}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  claimDrop(e, (paths) => {
                    const accepted = paths.filter((p) =>
                      matchesExtensions(p, IMAGE_EXTENSIONS),
                    );
                    if (accepted[0]) loadSingleFile(accepted[0]);
                  });
                }}
              >
                <div className={styles.batchViewerHeader}>
                  <div className={styles.batchViewerTitleRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <Image24Regular fontSize={24} />
                      <Subtitle2 className={styles.batchFileName}>{preview.fileName}</Subtitle2>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isUpdatingPreview && <Spinner size="tiny" label={t("common.loading")} />}
                      <Button
                        appearance="subtle"
                        icon={<ImageEdit20Regular />}
                        onClick={async () => {
                          const files = await api.dialogs.openFiles([dialogFilter(t, "images")], false);
                          if (files[0]) loadSingleFile(files[0]);
                        }}
                      >
                        {t("compressor.changeImage")}
                      </Button>
                      {singleFile && (
                        <Button
                          appearance="subtle"
                          icon={<ArrowForward16Regular />}
                          onClick={() => openTransferModal(singleFile, "compressor")}
                          title={t("transfer.buttonTooltip")}
                        >
                          {t("transfer.button")}
                        </Button>
                      )}
                      <Button
                        appearance="subtle"
                        icon={<Delete16Regular />}
                        onClick={() => {
                          setSingleFile(null);
                          setPreview(null);
                          setCompressedPreview(null);
                          compressJob.reset();
                        }}
                      >
                        {t("common.clearAll")}
                      </Button>
                    </div>
                  </div>
                  <Caption1 className={styles.muted}>
                    {t("compressor.before")} ➔ {t("compressor.after")} · {preview.width} × {preview.height} px · {preview.format.toUpperCase()} · {formatBytes(preview.size)}
                  </Caption1>
                </div>

                <div className={styles.sliderContainer}>
                  {compressedPreview?.dataUrl ? (
                    <ImageComparison
                      maxHeight="100%"
                      before={preview.dataUrl}
                      after={compressedPreview.dataUrl}
                      beforeLabel={t("compressor.before")}
                      afterLabel={t("compressor.after")}
                    />
                  ) : (
                    <Spinner label={t("common.loading")} />
                  )}
                </div>

                {compressedPreview && (
                  <div className={styles.statsBar}>
                    <div className={styles.statsGroup}>
                      <Caption1>{t("compressor.before")}:</Caption1>
                      <Text weight="semibold">{formatBytes(preview.size)}</Text>
                    </div>

                    <div className={styles.statsGroup}>
                      <Caption1>{t("compressor.after")}:</Caption1>
                      <Text weight="semibold" className={styles.savedValue}>
                        {formatBytes(compressedPreview.compressedBytes)}
                      </Text>
                    </div>

                    <div className={styles.statsGroup}>
                      <Badge appearance="filled" color={compressedPreview.savedPercent > 0 ? "success" : "informative"}>
                        -{compressedPreview.savedPercent}% ({formatBytes(compressedPreview.savedBytes)})
                      </Badge>
                      {isUpdatingPreview && <Spinner size="extra-tiny" />}
                    </div>
                  </div>
                )}

                {compressJob.result?.outPath && compressJob.result?.results?.[0]?.file === singleFile && (
                  <ResultCard
                    title={t("compressor.status.done")}
                    path={compressJob.result.outPath}
                    sourceToolId="compressor"
                  />
                )}
              </div>

              <ActionBar job={compressJob.job} onCancel={compressJob.cancel}>
                <Button
                  appearance="primary"
                  icon={<ArrowMinimize24Regular />}
                  disabled={compressJob.running || !compressedPreview}
                  onClick={handleSingleSave}
                >
                  {t("compressor.compressAction")}
                </Button>
              </ActionBar>
            </div>
          )
        ) : (
          /* ==================== TAB: BATCH COMPRESSION ==================== */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Compression Settings Bar */}
            {renderSettingsBar()}

            <div className={styles.batchGrid}>
              {/* Left pane: File List & DropZone */}
              <div className={styles.batchListPane}>
                <DropZone
                  compact
                  icon={Image24Regular}
                  title={t("compressor.dropBatchTitle")}
                  hint={t("compressor.dropBatchHint")}
                  accept={IMAGE_EXTENSIONS}
                  onFiles={(files) => {
                    compressJob.reset();
                    setBatchFiles((prev) => Array.from(new Set([...prev, ...files])));
                  }}
                  onBrowse={async () => {
                    const files = await api.dialogs.openFiles([dialogFilter(t, "images")]);
                    if (files.length) {
                      compressJob.reset();
                      setBatchFiles((prev) => Array.from(new Set([...prev, ...files])));
                    }
                  }}
                />

                {batchFiles.length > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Subtitle2>{t("converter.filesSelected", { count: batchFiles.length })}</Subtitle2>
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<Delete16Regular />}
                        onClick={() => {
                          setBatchFiles([]);
                          compressJob.reset();
                        }}
                      >
                        {t("common.clearAll")}
                      </Button>
                    </div>

                    <div className={styles.fileList}>
                      {batchFiles.map((file, idx) => (
                        <div
                          key={file}
                          className={mergeClasses(styles.fileItem, idx === selectedBatchIndex && styles.fileItemActive)}
                          onClick={() => setSelectedBatchIndex(idx)}
                        >
                          <Caption1 className={styles.name}>{fileName(file)}</Caption1>
                          <Button
                            size="small"
                            appearance="subtle"
                            icon={<Delete16Regular />}
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = batchFiles.filter((_, i) => i !== idx);
                              setBatchFiles(next);
                              if (next.length === 0) {
                                compressJob.reset();
                              }
                              if (selectedBatchIndex >= next.length) {
                                setSelectedBatchIndex(Math.max(0, next.length - 1));
                              }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Right pane: Before & After comparison of selected batch file */}
              <div className={styles.viewerPane}>
                <div className={styles.batchViewerHeader}>
                  <div className={styles.batchViewerTitleRow}>
                    <Subtitle2 className={styles.batchFileName}>
                      {batchPreview ? batchPreview.fileName : t("common.preview")}
                    </Subtitle2>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isUpdatingBatchPreview && <Spinner size="tiny" label={t("common.loading")} />}
                      {activeBatchPath && (
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<ArrowForward16Regular />}
                          onClick={() => openTransferModal(activeBatchPath, "compressor")}
                          title={t("transfer.buttonTooltip")}
                        >
                          {t("transfer.button")}
                        </Button>
                      )}
                    </div>
                  </div>
                  {batchPreview && (
                    <Caption1 className={styles.muted}>
                      {t("compressor.before")} ➔ {t("compressor.after")} · {batchPreview.width} × {batchPreview.height} px · {batchPreview.format.toUpperCase()}
                    </Caption1>
                  )}
                </div>

                <div className={styles.sliderContainer}>
                  {batchPreview && batchCompressedPreview?.dataUrl ? (
                    <ImageComparison
                      maxHeight="100%"
                      before={batchPreview.dataUrl}
                      after={batchCompressedPreview.dataUrl}
                      beforeLabel={t("compressor.before")}
                      afterLabel={t("compressor.after")}
                    />
                  ) : batchFiles.length === 0 ? (
                    <Caption1 className={styles.muted}>{t("compressor.dropBatchHint")}</Caption1>
                  ) : (
                    <Spinner label={t("common.loading")} />
                  )}
                </div>

                {batchPreview && batchCompressedPreview && (
                  <div className={styles.statsBar}>
                    <div className={styles.statsGroup}>
                      <Caption1>{t("compressor.before")}:</Caption1>
                      <Text weight="semibold">{formatBytes(batchPreview.size)}</Text>
                    </div>

                    <div className={styles.statsGroup}>
                      <Caption1>{t("compressor.after")}:</Caption1>
                      <Text weight="semibold" className={styles.savedValue}>
                        {formatBytes(batchCompressedPreview.compressedBytes)}
                      </Text>
                    </div>

                    <div className={styles.statsGroup}>
                      <Badge appearance="filled" color={batchCompressedPreview.savedPercent > 0 ? "success" : "informative"}>
                        -{batchCompressedPreview.savedPercent}% ({formatBytes(batchCompressedPreview.savedBytes)})
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {compressJob.result && !compressJob.result.outPath && batchFiles.length > 0 && (
              <>
                {compressJob.result.results && compressJob.result.results.length > 0 && (
                  <AfterGallery
                    title={t("transfer.compressedTitle")}
                    summary={t("compressor.summary", {
                      processed: compressJob.result.processed,
                      total: compressJob.result.total,
                      saved: formatBytes(compressJob.result.savedBytes),
                      percent: compressJob.result.savedPercent,
                    })}
                    files={compressJob.result.files || compressJob.result.results.map((r) => r.dest)}
                    items={compressJob.result.results.map((r) => ({
                      file: r.file,
                      dest: r.dest,
                      name: fileName(r.dest),
                      originalSize: r.inBytes,
                      size: r.outBytes,
                      savedPercent: r.savedPercent,
                    }))}
                    outputDir={compressJob.result.outputDir}
                    sourceToolId="compressor"
                  />
                )}
              </>
            )}

            <ActionBar job={compressJob.job} onCancel={compressJob.cancel}>
              <Button
                appearance="primary"
                icon={<ArrowMinimize24Regular />}
                disabled={compressJob.running || !batchFiles.length}
                onClick={handleBatchStart}
              >
                {t("compressor.compressBatchAction")}
              </Button>
            </ActionBar>
          </div>
        )}
      </div>
    </Page>
  );
}

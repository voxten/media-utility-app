import {
  Badge,
  Button,
  Caption1,
  Divider,
  Dropdown,
  Field,
  Input,
  makeStyles,
  Option,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRotateClockwise24Regular,
  ArrowRotateCounterclockwise24Regular,
  ArrowSync24Regular,
  FlipHorizontal24Regular,
  FlipVertical24Regular,
  Link16Regular,
  LinkDismiss16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { ActiveTool, ImageOperations } from "./types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "8px",
    padding: "10px 14px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
    minHeight: "76px",
    boxSizing: "border-box",
    width: "100%",
  },
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    width: "100%",
  },
  cropRow: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "16px",
    width: "100%",
  },
  cropPresetField: {
    width: "220px",
    minWidth: "220px",
    flexShrink: 0,
  },
  // Single-row, non-overlapping Resize layout with clear gaps
  resizeRow: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "16px",
    width: "100%",
  },
  transformRow: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "16px",
    width: "100%",
  },
  buttonGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  dimensionGroup: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
    flexShrink: 0,
  },
  dimField: {
    width: "115px",
    minWidth: "115px",
    flexShrink: 0,
  },
  lockButton: {
    marginBottom: "2px",
    minWidth: "32px",
    width: "32px",
    height: "32px",
    padding: "0",
    flexShrink: 0,
  },
  scaleField: {
    width: "110px",
    minWidth: "110px",
    flexShrink: 0,
  },
  presetField: {
    width: "175px",
    minWidth: "175px",
    flexShrink: 0,
  },
  filterField: {
    width: "210px",
    minWidth: "210px",
    flexShrink: 0,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
  },
});

interface ToolOptionsBarProps {
  activeTool: ActiveTool;
  ops: ImageOperations;
  naturalWidth: number;
  naturalHeight: number;
  onOpsChange: (updater: (prev: ImageOperations) => ImageOperations) => void;
  onCropPresetChange: (preset: string) => void;
}

export function ToolOptionsBar({
  activeTool,
  ops,
  naturalWidth,
  naturalHeight,
  onOpsChange,
  onCropPresetChange,
}: ToolOptionsBarProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  // Resize Handlers
  const handleWidthChange = (val: number) => {
    onOpsChange((prev) => {
      const nextH = prev.lockAspect && prev.aspectRatio ? Math.max(1, Math.round(val / prev.aspectRatio)) : prev.targetHeight;
      return {
        ...prev,
        resizeActive: true,
        scalePercent: undefined,
        targetWidth: val,
        targetHeight: nextH,
      };
    });
  };

  const handleHeightChange = (val: number) => {
    onOpsChange((prev) => {
      const nextW = prev.lockAspect && prev.aspectRatio ? Math.max(1, Math.round(val * prev.aspectRatio)) : prev.targetWidth;
      return {
        ...prev,
        resizeActive: true,
        scalePercent: undefined,
        targetHeight: val,
        targetWidth: nextW,
      };
    });
  };

  const applyScalePercent = (pct: number) => {
    if (!naturalWidth || !naturalHeight) return;
    const w = Math.max(1, Math.round((naturalWidth * pct) / 100));
    const h = Math.max(1, Math.round((naturalHeight * pct) / 100));
    onOpsChange((prev) => ({
      ...prev,
      resizeActive: true,
      scalePercent: pct,
      targetWidth: w,
      targetHeight: h,
    }));
  };

  const applyResolutionPreset = (presetKey: string) => {
    if (presetKey === "original") {
      onOpsChange((prev) => ({
        ...prev,
        resizeActive: true,
        scalePercent: 100,
        targetWidth: naturalWidth,
        targetHeight: naturalHeight,
        aspectRatio: naturalWidth / naturalHeight,
      }));
      return;
    }
    const presets: Record<string, [number, number]> = {
      fhd: [1920, 1080],
      "4k": [3840, 2160],
      square: [1080, 1080],
      story: [1080, 1920],
      classic: [1600, 1200],
    };
    const res = presets[presetKey];
    if (!res) return;
    const [w, h] = res;
    onOpsChange((prev) => ({
      ...prev,
      resizeActive: true,
      scalePercent: undefined,
      targetWidth: w,
      targetHeight: h,
      aspectRatio: w / h,
    }));
  };

  // 1. CROP TOOL OPTIONS (Clean & uncluttered - actions & dimensions are directly on the crop frame)
  if (activeTool === "crop") {
    return (
      <div className={styles.container}>
        <div className={styles.cropRow}>
          <Field label={t("imageTools.cropPreset")} className={styles.cropPresetField}>
            <Dropdown
              style={{ minWidth: 0, width: "100%" }}
              value={
                ops.cropPreset === "free"
                  ? t("imageTools.cropFree")
                  : ops.cropPreset === "original"
                    ? t("imageTools.presetOriginal")
                    : ops.cropPreset === "1_1"
                      ? t("imageTools.crop1_1")
                      : ops.cropPreset === "16_9"
                        ? t("imageTools.crop16_9")
                        : ops.cropPreset === "9_16"
                          ? t("imageTools.crop9_16")
                          : ops.cropPreset === "4_3"
                            ? t("imageTools.crop4_3")
                            : ops.cropPreset === "3_2"
                              ? t("imageTools.crop3_2")
                              : t("imageTools.cropFree")
              }
              selectedOptions={[ops.cropPreset]}
              onOptionSelect={(_, d) => onCropPresetChange(d.optionValue as string)}
            >
              <Option value="free">{t("imageTools.cropFree")}</Option>
              <Option value="original">{t("imageTools.presetOriginal")}</Option>
              <Option value="1_1">{t("imageTools.crop1_1")}</Option>
              <Option value="16_9">{t("imageTools.crop16_9")}</Option>
              <Option value="9_16">{t("imageTools.crop9_16")}</Option>
              <Option value="4_3">{t("imageTools.crop4_3")}</Option>
              <Option value="3_2">{t("imageTools.crop3_2")}</Option>
            </Dropdown>
          </Field>

          <Divider vertical style={{ height: "32px", alignSelf: "flex-end", marginBottom: "4px" }} />

          <Caption1 className={styles.muted} style={{ marginBottom: "8px" }}>
            {t("imageTools.cropHelper")}
          </Caption1>
        </div>
      </div>
    );
  }

  // 2. RESIZE TOOL OPTIONS (All in one non-overlapping row with Dropdowns for Scale and Presets)
  if (activeTool === "resize") {
    const currentW = ops.targetWidth ?? naturalWidth;
    const currentH = ops.targetHeight ?? naturalHeight;
    const scaleDiff = naturalWidth > 0 ? Math.round((currentW / naturalWidth) * 100) : 100;

    return (
      <div className={styles.container}>
        <div className={styles.resizeRow}>
          {/* Dimensions: Width & Height with locked aspect ratio button */}
          <div className={styles.dimensionGroup}>
            <Field label={t("imageTools.width")} className={styles.dimField}>
              <Input
                type="number"
                style={{ minWidth: 0, width: "100%" }}
                value={String(currentW)}
                onChange={(_, d) => handleWidthChange(Math.max(1, Number(d.value) || 1))}
              />
            </Field>

            <Tooltip content={t("imageTools.lockAspect")} relationship="label">
              <Button
                className={styles.lockButton}
                appearance={ops.lockAspect ? "primary" : "subtle"}
                icon={ops.lockAspect ? <Link16Regular /> : <LinkDismiss16Regular />}
                onClick={() => {
                  const nextLock = !ops.lockAspect;
                  onOpsChange((prev) => ({
                    ...prev,
                    lockAspect: nextLock,
                    aspectRatio: nextLock && prev.targetHeight ? (prev.targetWidth || naturalWidth) / prev.targetHeight : prev.aspectRatio,
                  }));
                }}
              />
            </Tooltip>

            <Field label={t("imageTools.height")} className={styles.dimField}>
              <Input
                type="number"
                style={{ minWidth: 0, width: "100%" }}
                value={String(currentH)}
                onChange={(_, d) => handleHeightChange(Math.max(1, Number(d.value) || 1))}
              />
            </Field>
          </div>

          {/* Scale % Dropdown */}
          <Field label={t("imageTools.scalePercent")} className={styles.scaleField}>
            <Dropdown
              style={{ minWidth: 0, width: "100%" }}
              value={ops.scalePercent ? `${ops.scalePercent}%` : `${scaleDiff}%`}
              selectedOptions={[String(ops.scalePercent ?? "")]}
              onOptionSelect={(_, d) => {
                const val = Number(d.optionValue);
                if (val > 0) applyScalePercent(val);
              }}
            >
              <Option value="25">25%</Option>
              <Option value="50">50%</Option>
              <Option value="75">75%</Option>
              <Option value="100">100%</Option>
              <Option value="150">150%</Option>
              <Option value="200">200%</Option>
            </Dropdown>
          </Field>

          {/* Resolution Presets Dropdown */}
          <Field label={t("imageTools.presets")} className={styles.presetField}>
            <Dropdown
              style={{ minWidth: 0, width: "100%" }}
              placeholder={t("imageTools.presets")}
              onOptionSelect={(_, d) => {
                if (d.optionValue) applyResolutionPreset(d.optionValue);
              }}
            >
              <Option value="original">{t("imageTools.presetOriginal")}</Option>
              <Option value="fhd">{t("imageTools.presetFullHd")}</Option>
              <Option value="4k">{t("imageTools.preset4k")}</Option>
              <Option value="square">{t("imageTools.presetSquare")}</Option>
              <Option value="story">{t("imageTools.presetStory")}</Option>
              <Option value="classic">{t("imageTools.presetClassic")}</Option>
            </Dropdown>
          </Field>

          {/* Resampling Filter Dropdown */}
          <Field label={t("imageTools.filter")} className={styles.filterField}>
            <Dropdown
              style={{ minWidth: 0, width: "100%" }}
              value={
                ops.filter === "lanczos"
                  ? t("imageTools.filterLanczos")
                  : ops.filter === "bicubic"
                    ? t("imageTools.filterBicubic")
                    : ops.filter === "bilinear"
                      ? t("imageTools.filterBilinear")
                      : t("imageTools.filterNearest")
              }
              selectedOptions={[ops.filter]}
              onOptionSelect={(_, d) =>
                onOpsChange((prev) => ({
                  ...prev,
                  filter: d.optionValue as "lanczos" | "bicubic" | "bilinear" | "nearest",
                }))
              }
            >
              <Option value="lanczos">{t("imageTools.filterLanczos")}</Option>
              <Option value="bicubic">{t("imageTools.filterBicubic")}</Option>
              <Option value="bilinear">{t("imageTools.filterBilinear")}</Option>
              <Option value="nearest">{t("imageTools.filterNearest")}</Option>
            </Dropdown>
          </Field>
        </div>
      </div>
    );
  }

  // 3. TRANSFORM TOOL OPTIONS (Rotate & Flip)
  if (activeTool === "transform") {
    return (
      <div className={styles.container}>
        <div className={styles.transformRow}>
          <Field label={t("imageTools.rotation")}>
            <div className={styles.buttonGroup}>
              <Button
                icon={<ArrowRotateCounterclockwise24Regular />}
                onClick={() =>
                  onOpsChange((prev) => ({
                    ...prev,
                    rotation: (prev.rotation + 270) % 360,
                  }))
                }
              >
                {t("imageTools.rotateLeft")}
              </Button>

              <Button
                icon={<ArrowRotateClockwise24Regular />}
                onClick={() =>
                  onOpsChange((prev) => ({
                    ...prev,
                    rotation: (prev.rotation + 90) % 360,
                  }))
                }
              >
                {t("imageTools.rotateRight")}
              </Button>

              <Button
                icon={<ArrowSync24Regular />}
                onClick={() =>
                  onOpsChange((prev) => ({
                    ...prev,
                    rotation: (prev.rotation + 180) % 360,
                  }))
                }
              >
                {t("imageTools.rotate180")}
              </Button>
            </div>
          </Field>

          <Divider vertical style={{ height: "32px", alignSelf: "flex-end", marginBottom: "4px" }} />

          <Field label={t("imageTools.flip")}>
            <div className={styles.buttonGroup}>
              <Button
                appearance={ops.flipH ? "primary" : "secondary"}
                icon={<FlipHorizontal24Regular />}
                onClick={() =>
                  onOpsChange((prev) => ({
                    ...prev,
                    flipH: !prev.flipH,
                  }))
                }
              >
                {t("imageTools.flipH")}
              </Button>

              <Button
                appearance={ops.flipV ? "primary" : "secondary"}
                icon={<FlipVertical24Regular />}
                onClick={() =>
                  onOpsChange((prev) => ({
                    ...prev,
                    flipV: !prev.flipV,
                  }))
                }
              >
                {t("imageTools.flipV")}
              </Button>

              {ops.rotation !== 0 && (
                <Badge appearance="outline" color="informative" style={{ marginLeft: "4px" }}>
                  {ops.rotation}°
                </Badge>
              )}
            </div>
          </Field>
        </div>
      </div>
    );
  }

  // 4. SELECT / POINTER TOOL (Default Inspection View)
  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <Text size={200} weight="semibold">{t("imageTools.toolbox.title")}:</Text>
        <Caption1 className={styles.muted}>
          {t("imageTools.toolbox.hint")}
        </Caption1>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ColumnDoubleCompare20Regular,
  Eye20Regular,
  Image20Regular,
  ImageSplit20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { CompareSlider } from "./CompareSlider";

export type CompareViewMode = "split" | "side" | "after" | "before";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    height: "100%",
    maxHeight: "100%",
    position: "relative",
    gap: "10px",
    boxSizing: "border-box",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  modeBar: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 6px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(8px)",
    boxShadow: tokens.shadow8,
    zIndex: 10,
    flexShrink: 0,
  },
  modeBtn: {
    color: "#fff",
    minWidth: "auto",
    padding: "4px 8px",
    height: "28px",
    ":hover": {
      color: "#fff",
      backgroundColor: "rgba(255,255,255,0.15)",
    },
  },
  modeBtnActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
    color: "#fff",
    fontWeight: tokens.fontWeightSemibold,
  },
  contentArea: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
  },
  sideGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    width: "100%",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    padding: "4px",
  },
  sideCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    minHeight: 0,
    minWidth: 0,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: "8px",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: "8px",
    left: "8px",
    padding: "3px 8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "rgba(0,0,0,0.65)",
    color: "#fff",
    zIndex: 2,
    boxShadow: tokens.shadow4,
  },
  sideImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    borderRadius: tokens.borderRadiusSmall,
    boxShadow: tokens.shadow8,
    display: "block",
  },
  singleCard: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  },
  singleImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    display: "block",
  },
});

interface ImageComparisonProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  maxHeight?: string;
  initialMode?: CompareViewMode;
  aspectRatio?: number;
}

export function ImageComparison({
  before,
  after,
  beforeLabel,
  afterLabel,
  maxHeight = "calc(min(64vh, 660px) - 32px)",
  initialMode = "split",
  aspectRatio,
}: ImageComparisonProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [mode, setMode] = useState<CompareViewMode>(initialMode);

  const bLabel = beforeLabel ?? t("common.before");
  const aLabel = afterLabel ?? t("common.after");

  return (
    <div className={styles.container} style={{ maxHeight }}>
      <div className={styles.modeBar}>
        <Button
          size="small"
          appearance="subtle"
          icon={<ImageSplit20Regular />}
          className={mergeClasses(styles.modeBtn, mode === "split" && styles.modeBtnActive)}
          onClick={() => setMode("split")}
        >
          {t("common.viewSplit")}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          icon={<ColumnDoubleCompare20Regular />}
          className={mergeClasses(styles.modeBtn, mode === "side" && styles.modeBtnActive)}
          onClick={() => setMode("side")}
        >
          {t("common.viewSide")}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          icon={<Eye20Regular />}
          className={mergeClasses(styles.modeBtn, mode === "after" && styles.modeBtnActive)}
          onClick={() => setMode("after")}
        >
          {t("common.viewAfter")}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          icon={<Image20Regular />}
          className={mergeClasses(styles.modeBtn, mode === "before" && styles.modeBtnActive)}
          onClick={() => setMode("before")}
        >
          {t("common.viewBefore")}
        </Button>
      </div>

      <div className={styles.contentArea}>
        {mode === "split" && (
          <CompareSlider
            before={before}
            after={after}
            beforeLabel={bLabel}
            afterLabel={aLabel}
            maxHeight="100%"
            aspectRatio={aspectRatio}
          />
        )}

        {mode === "side" && (
          <div className={styles.sideGrid}>
            <div className={styles.sideCard}>
              <Caption1 className={styles.badge}>{bLabel}</Caption1>
              <img src={before} alt={bLabel} className={styles.sideImg} draggable={false} />
            </div>
            <div className={styles.sideCard}>
              <Caption1 className={styles.badge}>{aLabel}</Caption1>
              <img src={after} alt={aLabel} className={styles.sideImg} draggable={false} />
            </div>
          </div>
        )}

        {mode === "after" && (
          <div className={styles.singleCard}>
            <Caption1 className={styles.badge}>{aLabel}</Caption1>
            <img src={after} alt={aLabel} className={styles.singleImg} draggable={false} />
          </div>
        )}

        {mode === "before" && (
          <div className={styles.singleCard}>
            <Caption1 className={styles.badge}>{bLabel}</Caption1>
            <img src={before} alt={bLabel} className={styles.singleImg} draggable={false} />
          </div>
        )}
      </div>
    </div>
  );
}

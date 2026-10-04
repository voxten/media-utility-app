import { Button, Divider, makeStyles, Tooltip, tokens } from "@fluentui/react-components";
import {
  ArrowMaximize24Regular,
  ArrowReset24Regular,
  ArrowRotateClockwise24Regular,
  Crop24Regular,
  Cursor20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { ActiveTool } from "./types";

const useStyles = makeStyles({
  toolbox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    padding: "8px 6px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow4,
    width: "48px",
    flexShrink: 0,
    zIndex: 10,
  },
  toolButton: {
    width: "36px",
    height: "36px",
    minWidth: "36px",
    padding: "0",
    borderRadius: tokens.borderRadiusMedium,
  },
  activeButton: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    boxShadow: tokens.shadow4,
    ":hover": {
      backgroundColor: tokens.colorBrandBackgroundHover,
      color: tokens.colorNeutralForegroundOnBrand,
    },
  },
});

interface ImageToolboxProps {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  onReset: () => void;
  disabled?: boolean;
}

export function ImageToolbox({ activeTool, onSelectTool, onReset, disabled }: ImageToolboxProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  return (
    <div className={styles.toolbox} role="toolbar" aria-label={t("imageTools.toolbox.title")}>
      {/* Select / View Tool */}
      <Tooltip content={`${t("imageTools.toolbox.select")} (V)`} relationship="label">
        <Button
          className={`${styles.toolButton} ${activeTool === "select" ? styles.activeButton : ""}`}
          appearance={activeTool === "select" ? "primary" : "subtle"}
          icon={<Cursor20Regular />}
          disabled={disabled}
          onClick={() => onSelectTool("select")}
        />
      </Tooltip>

      {/* Crop Tool */}
      <Tooltip content={`${t("imageTools.toolbox.crop")} (C)`} relationship="label">
        <Button
          className={`${styles.toolButton} ${activeTool === "crop" ? styles.activeButton : ""}`}
          appearance={activeTool === "crop" ? "primary" : "subtle"}
          icon={<Crop24Regular />}
          disabled={disabled}
          onClick={() => onSelectTool("crop")}
        />
      </Tooltip>

      {/* Resize Tool */}
      <Tooltip content={`${t("imageTools.toolbox.resize")} (R)`} relationship="label">
        <Button
          className={`${styles.toolButton} ${activeTool === "resize" ? styles.activeButton : ""}`}
          appearance={activeTool === "resize" ? "primary" : "subtle"}
          icon={<ArrowMaximize24Regular />}
          disabled={disabled}
          onClick={() => onSelectTool("resize")}
        />
      </Tooltip>

      {/* Rotate / Flip Tool */}
      <Tooltip content={`${t("imageTools.toolbox.transform")} (T)`} relationship="label">
        <Button
          className={`${styles.toolButton} ${activeTool === "transform" ? styles.activeButton : ""}`}
          appearance={activeTool === "transform" ? "primary" : "subtle"}
          icon={<ArrowRotateClockwise24Regular />}
          disabled={disabled}
          onClick={() => onSelectTool("transform")}
        />
      </Tooltip>

      <Divider style={{ width: "28px", margin: "4px 0" }} />

      {/* Reset Tool */}
      <Tooltip content={t("imageTools.toolbox.reset")} relationship="label">
        <Button
          className={styles.toolButton}
          appearance="subtle"
          icon={<ArrowReset24Regular />}
          disabled={disabled}
          onClick={onReset}
        />
      </Tooltip>
    </div>
  );
}

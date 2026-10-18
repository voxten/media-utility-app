// Layout shared by tools that edit one image: drop zone, file panel with options, preview stage,
// before/after comparison, save fields and the action bar.

import type { ReactNode } from "react";
import { Button, Caption1, makeStyles, mergeClasses, Text, tokens } from "@fluentui/react-components";
import { ArrowRight16Regular, FolderOpen16Regular, Image24Regular, ImageEdit20Regular, Save16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { checkerboard } from "../lib/checkerboard";
import { dialogFilter, IMAGE_EXTENSIONS } from "../lib/fileTypes";
import { fileName } from "../lib/format";
import { IMAGE_STAGE_CONTENT_HEIGHT, IMAGE_STAGE_HEIGHT, IMAGE_STAGE_PADDING } from "../lib/imageStage";
import { useIncomingTransfer } from "../lib/useIncomingTransfer";
import type { JobState } from "../stores/jobs";
import { useTransferStore } from "../stores/transfer";
import { ActionBar } from "./ActionBar";
import { DropZone } from "./DropZone";
import { ImageComparison } from "./ImageComparison";
import { ToolPage } from "./Page";
import { Panel } from "./Panel";
import { type SaveOutput, SaveOutputFields } from "./SaveOutput";

const useStyles = makeStyles({
  fileRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  stage: {
    height: IMAGE_STAGE_HEIGHT,
    minHeight: "340px",
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: IMAGE_STAGE_PADDING,
    boxSizing: "border-box",
    position: "relative",
  },
  checker: checkerboard(),
  preview: {
    maxWidth: "100%",
    maxHeight: IMAGE_STAGE_CONTENT_HEIGHT,
    objectFit: "contain",
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusMedium,
  },
  hidden: { display: "none" },
  contents: { display: "contents" },
});

export interface SingleImage {
  width: number;
  height: number;
  dataUrl: string;
}

interface SingleImageToolProps {
  toolId: string;
  /** Loaded image, or null to show the drop zone. */
  image: SingleImage | null;
  sourcePath: string;
  result: { dataUrl: string; resultPath: string } | null;
  onLoad: (path: string) => void;
  dropTitle: string;
  dropHint: string;
  /** Model download prompt; `emptyBanner` replaces it while no image is loaded. */
  banner?: ReactNode;
  emptyBanner?: ReactNode;
  /** Text after the file name; defaults to the image size. */
  caption?: ReactNode;
  /** Options shown above the stage. */
  toolbar?: ReactNode;
  /** Replaces the plain preview while editing; stays mounted (hidden) while the result is compared. */
  editor?: ReactNode;
  /** Stage background instead of the checkerboard. */
  stageClassName?: string;
  afterLabel?: string;
  output: SaveOutput;
  saveExtensions: string[];
  job?: JobState;
  idleText: ReactNode;
  onCancel: () => void;
  /** Primary action while no result is shown. */
  runAction: ReactNode;
  /** Leading buttons while the result is shown (e.g. back to options, run again). */
  resultActions?: ReactNode;
  /** Load the result as the new input. */
  onContinue?: () => void;
}

export function SingleImageTool({
  toolId,
  image,
  sourcePath,
  result,
  onLoad,
  dropTitle,
  dropHint,
  banner,
  emptyBanner = banner,
  caption,
  toolbar,
  editor,
  stageClassName,
  afterLabel,
  output,
  saveExtensions,
  job,
  idleText,
  onCancel,
  runAction,
  resultActions,
  onContinue,
}: SingleImageToolProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  useIncomingTransfer(toolId, (files) => {
    if (files[0]) onLoad(files[0]);
  });

  const browse = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "images")], false);
    if (path) onLoad(path);
  };

  if (!image) {
    return (
      <ToolPage toolId={toolId}>
        <DropZone
          icon={Image24Regular}
          title={dropTitle}
          hint={dropHint}
          accept={IMAGE_EXTENSIONS}
          onFiles={(paths) => onLoad(paths[0])}
          onBrowse={browse}
        />
        {emptyBanner}
      </ToolPage>
    );
  }

  return (
    <ToolPage toolId={toolId}>
      <Panel
        title={
          <span className={styles.fileRow}>
            <Image24Regular />
            <Text weight="semibold">{fileName(sourcePath)}</Text>
            <Caption1>{caption ?? `${image.width}×${image.height}`}</Caption1>
          </span>
        }
        actions={
          <>
            <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
              {t("common.changeImage")}
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([result?.resultPath ?? sourcePath], toolId)}
            >
              {t("transfer.sendTo")}
            </Button>
          </>
        }
      >
        {banner}
        {toolbar}

        <div className={mergeClasses(styles.stage, stageClassName ?? styles.checker)}>
          {result && (
            <ImageComparison
              before={image.dataUrl}
              after={result.dataUrl}
              afterLabel={afterLabel}
              aspectRatio={image.width && image.height ? image.width / image.height : undefined}
            />
          )}
          <div className={result ? styles.hidden : styles.contents}>
            {editor ?? <img src={image.dataUrl} alt={fileName(sourcePath)} className={styles.preview} draggable={false} />}
          </div>
        </div>

        <SaveOutputFields output={output} />
      </Panel>

      <ActionBar job={job?.status === "running" ? job : undefined} idleText={idleText} onCancel={onCancel}>
        {result ? (
          <>
            {resultActions}
            {onContinue && <Button onClick={onContinue}>{t("common.continueWithResult")}</Button>}
            <Button appearance="primary" icon={<Save16Regular />} disabled={!output.canSave} onClick={() => output.saveHere(result.resultPath)}>
              {t("common.saveBtn")}
            </Button>
            <Button
              appearance="subtle"
              icon={<FolderOpen16Regular />}
              onClick={() => output.saveAs(result.resultPath, [dialogFilter(t, "images", saveExtensions)])}
            >
              {t("common.saveAs")}
            </Button>
          </>
        ) : (
          runAction
        )}
      </ActionBar>
    </ToolPage>
  );
}

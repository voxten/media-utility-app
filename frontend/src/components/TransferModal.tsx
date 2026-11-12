import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowForward16Regular,
  Dismiss24Regular,
  Document24Regular,
  DocumentPdf24Regular,
  Image24Regular,
  MusicNote224Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { CATEGORY_ACCENTS, toolById, TOOLS } from "../app/tools";
import { fileExtension, formatName, mediaKind } from "../lib/fileTypes";
import { fileName, formatBytes } from "../lib/format";
import { navigate } from "../lib/router";
import { useThumbnail } from "../lib/useThumbnail";
import { useTransferStore } from "../stores/transfer";
import { FileThumbnail } from "./FileThumbnail";
import { ToolIconTile } from "./ToolIconTile";

interface TargetToolItem {
  id: string;
  subTab?: string;
  noteKey?: string;
}

const useStyles = makeStyles({
  surface: {
    maxWidth: "640px",
    width: "100%",
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  closeButton: {
    position: "absolute",
    top: tokens.spacingVerticalL,
    right: tokens.spacingHorizontalL,
    zIndex: 10,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    marginBottom: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXXXL,
  },
  sourceCard: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalMNudge} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    marginBottom: tokens.spacingVerticalL,
  },
  sourceThumbBox: {
    width: "48px",
    height: "48px",
    minWidth: "48px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sourceThumbImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },
  sourceMeta: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    flexGrow: 1,
  },
  sourceFileName: {
    fontWeight: tokens.fontWeightSemibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sectionTitle: {
    marginBottom: tokens.spacingVerticalMNudge,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    textTransform: "uppercase",
    fontWeight: tokens.fontWeightSemibold,
  },
  toolsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: tokens.spacingHorizontalMNudge,
    maxHeight: "360px",
    overflowY: "auto",
    padding: tokens.spacingHorizontalXXS,
  },
  toolCard: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalMNudge} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    cursor: "pointer",
    transitionProperty: "background-color, box-shadow",
    transitionDuration: tokens.durationFast,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
      boxShadow: tokens.shadow4,
    },
  },
  toolInfo: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    flexGrow: 1,
  },
  toolTitle: { fontWeight: tokens.fontWeightSemibold },
  toolDesc: {
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  arrowIcon: {
    color: tokens.colorNeutralForeground4,
    marginLeft: "auto",
    flexShrink: 0,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
    gap: tokens.spacingVerticalS,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  inlineRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalSNudge },
});

export function TransferModal() {
  const { t } = useTranslation();
  const styles = useStyles();

  const isModalOpen = useTransferStore((s) => s.isModalOpen);
  const modalFiles = useTransferStore((s) => s.modalFiles);
  const sourceToolId = useTransferStore((s) => s.sourceToolId);
  const origin = useTransferStore((s) => s.origin);
  const closeModal = useTransferStore((s) => s.closeModal);
  const sendToTool = useTransferStore((s) => s.sendToTool);

  // Dropped files can be mixed: offer tools for the first one a tool understands and pass on only that kind.
  const firstFile = modalFiles.find((f) => mediaKind(f)) ?? modalFiles[0] ?? "";
  const fileType = firstFile ? mediaKind(firstFile) : null;
  const files = fileType ? modalFiles.filter((f) => mediaKind(f) === fileType) : modalFiles;
  const ext = firstFile ? formatName(fileExtension(firstFile)) : "";

  const thumb = useThumbnail(fileType === "image" || fileType === "gif" ? firstFile : null);

  const targetTools: TargetToolItem[] = TOOLS.flatMap((tool) => {
    const accept = fileType && tool.id !== sourceToolId ? tool.accepts?.[fileType] : undefined;
    if (!accept) return [];
    return [accept === true ? { id: tool.id } : { id: tool.id, subTab: accept.subTab, noteKey: accept.noteKey }];
  });

  const handleSelectTool = (item: TargetToolItem) => {
    sendToTool(item.id, files, item.subTab);
    navigate(item.id);
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(_, d) => !d.open && closeModal()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <Tooltip content={t("common.close")} relationship="label">
            <Button
              className={styles.closeButton}
              appearance="subtle"
              aria-label={t("common.close")}
              icon={<Dismiss24Regular />}
              onClick={closeModal}
            />
          </Tooltip>

          <div className={styles.header}>
            <DialogTitle>{t(origin === "drop" ? "transfer.dropTitle" : "transfer.modalTitle")}</DialogTitle>
            <Caption1 className={styles.muted}>{t("transfer.modalDesc")}</Caption1>
          </div>

          <DialogContent>
            {firstFile && (
              <div className={styles.sourceCard}>
                <div className={styles.sourceThumbBox}>
                  {fileType === "image" || fileType === "gif" ? (
                    <FileThumbnail path={firstFile} className={styles.sourceThumbImg} fallback={<Image24Regular fontSize={24} />} />
                  ) : fileType === "pdf" ? (
                    <DocumentPdf24Regular fontSize={26} color={CATEGORY_ACCENTS.pdf} />
                  ) : fileType === "audio" ? (
                    <MusicNote224Regular fontSize={26} color={CATEGORY_ACCENTS.video} />
                  ) : fileType === "video" ? (
                    <Video24Regular fontSize={26} color={CATEGORY_ACCENTS.video} />
                  ) : (
                    <Document24Regular fontSize={26} />
                  )}
                </div>

                <div className={styles.sourceMeta}>
                  <Text className={styles.sourceFileName} title={firstFile}>
                    {files.length > 1
                      ? t("transfer.sourceFiles", { count: files.length })
                      : fileName(firstFile)}
                  </Text>
                  <div className={styles.inlineRow}>
                    {ext && <Badge size="small" appearance="tint" color="brand">{ext}</Badge>}
                    {thumb?.size ? <Caption1 className={styles.muted}>{formatBytes(thumb.size)}</Caption1> : null}
                  </div>
                </div>
              </div>
            )}

            <div className={styles.sectionTitle}>{t("transfer.compatibleTools")}</div>

            {targetTools.length > 0 ? (
              <div className={styles.toolsGrid}>
                {targetTools.map((target) => {
                  const def = toolById(target.id);
                  const Icon = def?.icon ?? Document24Regular;
                  const description = t(target.noteKey ?? `tools.${target.id}.description`);

                  return (
                    <div
                      key={target.id + (target.subTab ?? "")}
                      className={styles.toolCard}
                      onClick={() => handleSelectTool(target)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectTool(target);
                        }
                      }}
                    >
                      <ToolIconTile icon={Icon} accent={def?.accent ?? tokens.colorCompoundBrandBackground} />

                      <div className={styles.toolInfo}>
                        <Text className={styles.toolTitle}>{t(`tools.${target.id}.name`)}</Text>
                        <Caption1 className={styles.toolDesc} title={description}>
                          {description}
                        </Caption1>
                      </div>

                      <ArrowForward16Regular className={styles.arrowIcon} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Document24Regular fontSize={32} />
                <Text>{t("transfer.noCompatibleTools")}</Text>
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

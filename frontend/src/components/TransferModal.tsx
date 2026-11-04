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
    top: "16px",
    right: "16px",
    zIndex: 10,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    marginBottom: "12px",
    paddingRight: "36px",
  },
  titleText: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "18px",
  },
  sourceCard: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: "16px",
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
    gap: "2px",
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
    marginBottom: "10px",
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: tokens.fontWeightSemibold,
  },
  toolsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "10px",
    maxHeight: "360px",
    overflowY: "auto",
    padding: "2px",
  },
  toolCard: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "pointer",
    transition: "all 0.15s ease",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
      transform: "translateY(-1px)",
      boxShadow: tokens.shadow4,
    },
  },
  toolIconBox: {
    width: "36px",
    height: "36px",
    minWidth: "36px",
    borderRadius: tokens.borderRadiusSmall,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForegroundStaticInverted,
  },
  toolInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flexGrow: 1,
  },
  toolTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "13px",
  },
  toolDesc: {
    fontSize: "11px",
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
    padding: "24px",
    color: tokens.colorNeutralForeground3,
    gap: "8px",
  },
  muted: { color: tokens.colorNeutralForeground3 },
  inlineRow: { display: "flex", alignItems: "center", gap: "6px" },
});

export function TransferModal() {
  const { t } = useTranslation();
  const styles = useStyles();

  const isModalOpen = useTransferStore((s) => s.isModalOpen);
  const modalFiles = useTransferStore((s) => s.modalFiles);
  const sourceToolId = useTransferStore((s) => s.sourceToolId);
  const closeModal = useTransferStore((s) => s.closeModal);
  const sendToTool = useTransferStore((s) => s.sendToTool);

  const firstFile = modalFiles[0] ?? "";
  const fileType = firstFile ? mediaKind(firstFile) : null;
  const ext = firstFile ? formatName(fileExtension(firstFile)) : "";

  const thumb = useThumbnail(fileType === "image" || fileType === "gif" ? firstFile : null);

  const targetTools: TargetToolItem[] = TOOLS.flatMap((tool) => {
    const accept = fileType && tool.id !== sourceToolId ? tool.accepts?.[fileType] : undefined;
    if (!accept) return [];
    return [accept === true ? { id: tool.id } : { id: tool.id, subTab: accept.subTab, noteKey: accept.noteKey }];
  });

  const handleSelectTool = (item: TargetToolItem) => {
    sendToTool(item.id, modalFiles, item.subTab);
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
            <DialogTitle className={styles.titleText}>{t("transfer.modalTitle")}</DialogTitle>
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
                  ) : fileType === "video" ? (
                    <Video24Regular fontSize={26} color={CATEGORY_ACCENTS.video} />
                  ) : (
                    <Document24Regular fontSize={26} />
                  )}
                </div>

                <div className={styles.sourceMeta}>
                  <Text className={styles.sourceFileName} title={firstFile}>
                    {modalFiles.length > 1
                      ? t("transfer.sourceFiles", { count: modalFiles.length })
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
                  const accent = def?.accent ?? tokens.colorCompoundBrandBackground;
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
                      <div className={styles.toolIconBox} style={{ backgroundColor: accent }}>
                        <Icon fontSize={20} />
                      </div>

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

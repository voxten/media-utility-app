import { useEffect, useState } from "react";
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
  Spinner,
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
import { toolById } from "../app/tools";
import { api } from "../lib/bridge";
import { IMAGE_EXTENSIONS, PDF_EXTENSIONS, VIDEO_EXTENSIONS } from "../lib/fileTypes";
import { fileName, formatBytes } from "../lib/format";
import { navigate } from "../lib/router";
import { useTransferStore } from "../stores/transfer";

const IMAGE_EXTS = new Set([...IMAGE_EXTENSIONS, ".gif"]);
const PDF_EXTS = new Set(PDF_EXTENSIONS);
const VIDEO_EXTS = new Set(VIDEO_EXTENSIONS);

function getExt(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}

function getFileType(filePath: string): "image" | "pdf" | "video" | "unknown" {
  const ext = getExt(filePath);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (PDF_EXTS.has(ext)) return "pdf";
  if (VIDEO_EXTS.has(ext)) return "video";
  return "unknown";
}

interface TargetToolItem {
  id: string;
  nameKey: string;
  descKey: string;
  subTab?: string;
  subTabNoteKey?: string;
}

const useStyles = makeStyles({
  surface: {
    maxWidth: "640px",
    width: "100%",
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1,
    position: "relative",
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
    color: "#fff",
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
});

export function TransferModal() {
  const { t } = useTranslation();
  const styles = useStyles();

  const isModalOpen = useTransferStore((s) => s.isModalOpen);
  const modalFiles = useTransferStore((s) => s.modalFiles);
  const sourceToolId = useTransferStore((s) => s.sourceToolId);
  const closeModal = useTransferStore((s) => s.closeModal);
  const sendToTool = useTransferStore((s) => s.sendToTool);

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const firstFile = modalFiles[0] ?? "";
  const fileType = firstFile ? getFileType(firstFile) : "unknown";
  const ext = firstFile ? getExt(firstFile).replace(".", "").toUpperCase() : "";

  // Load preview thumbnail for images
  useEffect(() => {
    if (!isModalOpen || !firstFile) {
      setThumbUrl(null);
      setFileSize(null);
      return;
    }

    if (fileType === "image") {
      setIsLoadingPreview(true);
      api.image_editor
        .loadPreview(firstFile)
        .then((data) => {
          if (data?.dataUrl) setThumbUrl(data.dataUrl);
          if (data?.size) setFileSize(data.size);
        })
        .catch(() => undefined)
        .finally(() => setIsLoadingPreview(false));
    } else {
      setThumbUrl(null);
      setFileSize(null);
    }
  }, [isModalOpen, firstFile, fileType]);

  // Determine available target tools based on file type
  const targetTools: TargetToolItem[] = [];

  if (fileType === "image") {
    const list: TargetToolItem[] = [
      { id: "image_tools", nameKey: "tools.image_tools.name", descKey: "tools.image_tools.description" },
      { id: "compressor", nameKey: "tools.compressor.name", descKey: "tools.compressor.description" },
      { id: "rembg", nameKey: "tools.rembg.name", descKey: "tools.rembg.description" },
      { id: "upscale", nameKey: "tools.upscale.name", descKey: "tools.upscale.description" },
      { id: "watermark", nameKey: "tools.watermark.name", descKey: "tools.watermark.description" },
      { id: "converter", nameKey: "tools.converter.name", descKey: "tools.converter.description" },
      {
        id: "pdf_convert",
        nameKey: "tools.pdf_convert.name",
        descKey: "tools.pdf_convert.description",
        subTab: "imagesToPdf",
        subTabNoteKey: "transfer.asImagesToPdf",
      },
    ];
    targetTools.push(...list.filter((tool) => tool.id !== sourceToolId));
  } else if (fileType === "pdf") {
    const list: TargetToolItem[] = [
      { id: "pdf", nameKey: "tools.pdf.name", descKey: "tools.pdf.description" },
      { id: "pdf_compress", nameKey: "tools.pdf_compress.name", descKey: "tools.pdf_compress.description" },
      { id: "pdf_split", nameKey: "tools.pdf_split.name", descKey: "tools.pdf_split.description" },
      {
        id: "pdf_convert",
        nameKey: "tools.pdf_convert.name",
        descKey: "tools.pdf_convert.description",
        subTab: "pdfToImages",
        subTabNoteKey: "transfer.asPdfToImages",
      },
      { id: "pdf_extract", nameKey: "tools.pdf_extract.name", descKey: "tools.pdf_extract.description" },
    ];
    targetTools.push(...list.filter((tool) => tool.id !== sourceToolId));
  } else if (fileType === "video") {
    const list: TargetToolItem[] = [
      { id: "download", nameKey: "tools.download.name", descKey: "tools.download.description" },
    ];
    targetTools.push(...list.filter((tool) => tool.id !== sourceToolId));
  }

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
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{t("transfer.modalDesc")}</Caption1>
          </div>

          <DialogContent>
            {/* Source file preview card */}
            {firstFile && (
              <div className={styles.sourceCard}>
                <div className={styles.sourceThumbBox}>
                  {fileType === "image" ? (
                    isLoadingPreview ? (
                      <Spinner size="extra-tiny" />
                    ) : thumbUrl ? (
                      <img src={thumbUrl} className={styles.sourceThumbImg} alt={fileName(firstFile)} />
                    ) : (
                      <Image24Regular fontSize={24} />
                    )
                  ) : fileType === "pdf" ? (
                    <DocumentPdf24Regular fontSize={26} color="#d9480f" />
                  ) : fileType === "video" ? (
                    <Video24Regular fontSize={26} color="#e0475b" />
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
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {ext && <Badge size="small" appearance="tint" color="brand">{ext}</Badge>}
                    {fileSize ? (
                      <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{formatBytes(fileSize)}</Caption1>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Target Tools Selection Grid */}
            <div className={styles.sectionTitle}>{t("transfer.compatibleTools")}</div>

            {targetTools.length > 0 ? (
              <div className={styles.toolsGrid}>
                {targetTools.map((target) => {
                  const def = toolById(target.id);
                  const Icon = def?.icon ?? Document24Regular;
                  const accent = def?.accent ?? tokens.colorCompoundBrandBackground;

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
                        <Text className={styles.toolTitle}>{t(target.nameKey)}</Text>
                        <Caption1 className={styles.toolDesc} title={t(target.descKey)}>
                          {t(target.descKey)}
                        </Caption1>
                        {target.subTabNoteKey && (
                          <Badge size="tiny" color="informative" appearance="filled" style={{ marginTop: "2px", width: "fit-content" }}>
                            {t(target.subTabNoteKey)}
                          </Badge>
                        )}
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

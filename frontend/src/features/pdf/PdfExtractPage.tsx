import { useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Card,
  makeStyles,
  Subtitle2,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  Delete16Regular,
  DocumentPdf24Regular,
  FolderOpen16Regular,
  ArrowRight16Regular,
} from "@fluentui/react-icons";
import { DocumentExtract24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { api } from "../../lib/bridge";
import { fileName, formatBytes } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";

interface ExtractTextResult {
  outPath: string;
  charCount: number;
  bytes: number;
}

const useStyles = makeStyles({
  fileItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fileInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
  },
  fileMeta: {
    minWidth: 0,
  },
  fileNameText: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  resultCard: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    marginTop: "16px",
  },
  muted: { color: tokens.colorNeutralForeground3 },
});

export default function PdfExtractPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_extract")!;

  const [extractFile, setExtractFile] = useState<string | null>(null);

  useIncomingTransfer("pdf_extract", (files) => {
    if (files[0]) setExtractFile(files[0]);
  });

  const extract = useJobRunner<ExtractTextResult>("pdf.extract_text", {
    onDone: (result) =>
      notify.success(t("pdf.toast.extractSuccess"), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.extractError"), { body: error }),
  });

  const startExtract = async () => {
    if (!extractFile) return;
    const defaultName = `${fileName(extractFile).replace(/\.pdf$/i, "")}.txt`;
    const outPath = await api.dialogs.saveFile(defaultName, ["Text files (*.txt)"]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".txt") ? outPath : `${outPath}.txt`;
    extract.start(() => api.pdf.extractText(extractFile, target)).catch((err) => notify.error(String(err)));
  };

  return (
    <Page title={t("tools.pdf_extract.name")} description={t("tools.pdf_extract.description")} icon={tool.icon} accent={tool.accent}>
      <DropZone
        compact={!!extractFile}
        icon={DocumentPdf24Regular}
        title={extractFile ? t("pdf.dropChange") : t("pdf.dropSingleTitle")}
        hint={t("pdf.dropSingleHint")}
        accept={[".pdf"]}
        onFiles={(files) => files[0] && setExtractFile(files[0])}
        onBrowse={async () => {
          const files = await api.dialogs.openFiles(["PDF (*.pdf)"], false);
          if (files[0]) setExtractFile(files[0]);
        }}
      />

      {extractFile && (
        <Panel
          title={t("pdf.selectedFile")}
          actions={
            <div style={{ display: "flex", gap: "6px" }}>
              <Button
                appearance="subtle"
                icon={<ArrowRight16Regular />}
                onClick={() => useTransferStore.getState().openModal([extractFile], "pdf_extract")}
              >
                {t("transfer.sendTo")}
              </Button>
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => setExtractFile(null)}>
                {t("common.remove")}
              </Button>
            </div>
          }
        >
          <div className={styles.fileItem}>
            <div className={styles.fileInfo}>
              <DocumentPdf24Regular fontSize={28} />
              <div className={styles.fileMeta}>
                <Subtitle2 className={styles.fileNameText}>{fileName(extractFile)}</Subtitle2>
                <br />
                <Caption1 className={styles.muted}>{extractFile}</Caption1>
              </div>
            </div>
          </div>

          {extract.result && (
            <Card className={styles.resultCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Badge appearance="filled" color="success" icon={<CheckmarkCircle16Filled />}>
                  {t("pdf.toast.extractSuccess")}
                </Badge>
                <Text weight="semibold">
                  {formatBytes(extract.result.bytes)} ({extract.result.charCount} znaków)
                </Text>
              </div>
              <Caption1 className={styles.muted}>{extract.result.outPath}</Caption1>
              <div>
                <Button
                  size="small"
                  icon={<FolderOpen16Regular />}
                  onClick={() => api.system.reveal(extract.result!.outPath).catch(() => undefined)}
                >
                  {t("common.showInFolder")}
                </Button>
              </div>
            </Card>
          )}
        </Panel>
      )}

      <ActionBar
        job={extract.job}
        idleText={extractFile ? undefined : t("pdf.idle.empty")}
        onCancel={extract.cancel}
      >
        <Button
          appearance="primary"
          icon={<DocumentExtract24Regular />}
          disabled={!extractFile || extract.running}
          onClick={startExtract}
        >
          {t("pdf.extract.action")}
        </Button>
      </ActionBar>
    </Page>
  );
}

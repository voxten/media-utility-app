import { useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Card,
  Dropdown,
  Field,
  makeStyles,
  Option,
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
import { DocumentCompress24Regular } from "../../app/customIcons";
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

interface CompressResult {
  inPath: string;
  outPath: string;
  inBytes: number;
  outBytes: number;
  savedBytes: number;
  savedPercent: number;
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
  settingsRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginTop: "12px",
  },
  field: {
    minWidth: "260px",
    maxWidth: "400px",
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

export default function PdfCompressPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_compress")!;

  const [compressFile, setCompressFile] = useState<string | null>(null);
  const [compressPreset, setCompressPreset] = useState<"low" | "balanced" | "high">("balanced");

  useIncomingTransfer("pdf_compress", (files) => {
    if (files[0]) setCompressFile(files[0]);
  });

  const compress = useJobRunner<CompressResult>("pdf.compress", {
    onDone: (result) =>
      notify.success(t("pdf.toast.compressSuccess"), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.compressError"), { body: error }),
  });

  const startCompress = async () => {
    if (!compressFile) return;
    const defaultName = `${fileName(compressFile).replace(/\.pdf$/i, "")}_compressed.pdf`;
    const outPath = await api.dialogs.saveFile(defaultName, ["PDF (*.pdf)"]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".pdf") ? outPath : `${outPath}.pdf`;
    compress.start(() => api.pdf.compress(compressFile, target, compressPreset)).catch((err) => notify.error(String(err)));
  };

  return (
    <Page title={t("tools.pdf_compress.name")} description={t("tools.pdf_compress.description")} icon={tool.icon} accent={tool.accent}>
      <DropZone
        compact={!!compressFile}
        icon={DocumentPdf24Regular}
        title={compressFile ? t("pdf.dropChange") : t("pdf.dropSingleTitle")}
        hint={t("pdf.dropSingleHint")}
        accept={[".pdf"]}
        onFiles={(files) => files[0] && setCompressFile(files[0])}
        onBrowse={async () => {
          const files = await api.dialogs.openFiles(["PDF (*.pdf)"], false);
          if (files[0]) setCompressFile(files[0]);
        }}
      />

      {compressFile && (
        <Panel
          title={t("pdf.selectedFile")}
          actions={
            <div style={{ display: "flex", gap: "6px" }}>
              <Button
                appearance="subtle"
                icon={<ArrowRight16Regular />}
                onClick={() => useTransferStore.getState().openModal([compressFile], "pdf_compress")}
              >
                {t("transfer.sendTo")}
              </Button>
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => setCompressFile(null)}>
                {t("common.remove")}
              </Button>
            </div>
          }
        >
          <div className={styles.fileItem}>
            <div className={styles.fileInfo}>
              <DocumentPdf24Regular fontSize={28} />
              <div className={styles.fileMeta}>
                <Subtitle2 className={styles.fileNameText}>{fileName(compressFile)}</Subtitle2>
                <br />
                <Caption1 className={styles.muted}>{compressFile}</Caption1>
              </div>
            </div>
          </div>

          <div className={styles.settingsRow}>
            <Field label={t("pdf.compress.preset")} className={styles.field}>
              <Dropdown
                value={
                  compressPreset === "low"
                    ? t("pdf.compress.presetLow")
                    : compressPreset === "high"
                      ? t("pdf.compress.presetHigh")
                      : t("pdf.compress.presetBalanced")
                }
                selectedOptions={[compressPreset]}
                onOptionSelect={(_, d) => setCompressPreset(d.optionValue as "low" | "balanced" | "high")}
              >
                <Option value="balanced">{t("pdf.compress.presetBalanced")}</Option>
                <Option value="high">{t("pdf.compress.presetHigh")}</Option>
                <Option value="low">{t("pdf.compress.presetLow")}</Option>
              </Dropdown>
            </Field>
          </div>

          {compress.result && (
            <Card className={styles.resultCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Badge appearance="filled" color="success" icon={<CheckmarkCircle16Filled />}>
                  {t("pdf.toast.compressSuccess")}
                </Badge>
                <Text weight="semibold">
                  {t("pdf.compress.result", {
                    before: formatBytes(compress.result.inBytes),
                    after: formatBytes(compress.result.outBytes),
                    percent: compress.result.savedPercent,
                  })}
                </Text>
              </div>
              <Caption1 className={styles.muted}>{compress.result.outPath}</Caption1>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  size="small"
                  icon={<FolderOpen16Regular />}
                  onClick={() => api.system.reveal(compress.result!.outPath).catch(() => undefined)}
                >
                  {t("common.showInFolder")}
                </Button>
                <Button
                  size="small"
                  icon={<ArrowRight16Regular />}
                  onClick={() => useTransferStore.getState().openModal([compress.result!.outPath], "pdf_compress")}
                >
                  {t("transfer.sendTo")}
                </Button>
              </div>
            </Card>
          )}
        </Panel>
      )}

      <ActionBar
        job={compress.job}
        idleText={compressFile ? undefined : t("pdf.idle.empty")}
        onCancel={compress.cancel}
      >
        <Button
          appearance="primary"
          icon={<DocumentCompress24Regular />}
          disabled={!compressFile || compress.running}
          onClick={startCompress}
        >
          {t("pdf.compress.action")}
        </Button>
      </ActionBar>
    </Page>
  );
}

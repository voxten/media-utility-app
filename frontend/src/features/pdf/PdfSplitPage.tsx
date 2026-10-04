import { useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Card,
  Field,
  Input,
  makeStyles,
  Radio,
  RadioGroup,
  Subtitle2,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  Delete16Regular,
  DocumentPdf24Regular,
  FolderOpen16Regular,
  ArrowRight16Regular,
} from "@fluentui/react-icons";
import { DocumentSplit24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { api } from "../../lib/bridge";
import { fileName } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";

interface SplitResult {
  files: string[];
  count: number;
  outDir: string;
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
  settingsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "16px",
  },
  rangeField: {
    maxWidth: "360px",
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

export default function PdfSplitPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_split")!;

  const [splitFile, setSplitFile] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<"all" | "range">("all");
  const [splitRange, setSplitRange] = useState("1-3, 5");

  useIncomingTransfer("pdf_split", (files) => {
    if (files[0]) setSplitFile(files[0]);
  });

  const split = useJobRunner<SplitResult>("pdf.split", {
    onDone: (result) =>
      notify.success(t("pdf.toast.splitSuccess", { count: result.count }), {
        body: result.outDir,
        action: { label: t("common.showInFolder"), onClick: () => api.system.openPath(result.outDir).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.splitError"), { body: error }),
  });

  const startSplit = async () => {
    if (!splitFile) return;
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;
    split.start(() => api.pdf.split(splitFile, outDir, splitMode, splitRange)).catch((err) => notify.error(String(err)));
  };

  return (
    <Page title={t("tools.pdf_split.name")} description={t("tools.pdf_split.description")} icon={tool.icon} accent={tool.accent}>
      <DropZone
        compact={!!splitFile}
        icon={DocumentPdf24Regular}
        title={splitFile ? t("pdf.dropChange") : t("pdf.dropSingleTitle")}
        hint={t("pdf.dropSingleHint")}
        accept={[".pdf"]}
        onFiles={(files) => files[0] && setSplitFile(files[0])}
        onBrowse={async () => {
          const files = await api.dialogs.openFiles(["PDF (*.pdf)"], false);
          if (files[0]) setSplitFile(files[0]);
        }}
      />

      {splitFile && (
        <Panel
          title={t("pdf.selectedFile")}
          actions={
            <div style={{ display: "flex", gap: "6px" }}>
              <Button
                appearance="subtle"
                icon={<ArrowRight16Regular />}
                onClick={() => useTransferStore.getState().openModal([splitFile], "pdf_split")}
              >
                {t("transfer.sendTo")}
              </Button>
              <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => setSplitFile(null)}>
                {t("common.remove")}
              </Button>
            </div>
          }
        >
          <div className={styles.fileItem}>
            <div className={styles.fileInfo}>
              <DocumentPdf24Regular fontSize={28} />
              <div className={styles.fileMeta}>
                <Subtitle2 className={styles.fileNameText}>{fileName(splitFile)}</Subtitle2>
                <br />
                <Caption1 className={styles.muted}>{splitFile}</Caption1>
              </div>
            </div>
          </div>

          <div className={styles.settingsSection}>
            <Field label={t("pdf.split.mode")}>
              <RadioGroup value={splitMode} onChange={(_, d) => setSplitMode(d.value as "all" | "range")}>
                <Radio value="all" label={t("pdf.split.modeAll")} />
                <Radio value="range" label={t("pdf.split.modeRange")} />
              </RadioGroup>
            </Field>

            {splitMode === "range" && (
              <Field label={t("pdf.split.rangeLabel")} hint={t("pdf.split.rangeHint")} className={styles.rangeField}>
                <Input
                  value={splitRange}
                  placeholder={t("pdf.split.rangePlaceholder")}
                  onChange={(_, d) => setSplitRange(d.value)}
                />
              </Field>
            )}
          </div>

          {split.result && (
            <Card className={styles.resultCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Badge appearance="filled" color="success" icon={<CheckmarkCircle16Filled />}>
                  {t("pdf.toast.splitSuccess", { count: split.result.count })}
                </Badge>
              </div>
              <Caption1 className={styles.muted}>{split.result.outDir}</Caption1>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  size="small"
                  icon={<FolderOpen16Regular />}
                  onClick={() => api.system.openPath(split.result!.outDir).catch(() => undefined)}
                >
                  {t("common.showInFolder")}
                </Button>
                {split.result.files && split.result.files.length > 0 && (
                  <Button
                    size="small"
                    icon={<ArrowRight16Regular />}
                    onClick={() => useTransferStore.getState().openModal(split.result!.files, "pdf_split")}
                  >
                    {t("transfer.sendTo")}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </Panel>
      )}

      <ActionBar
        job={split.job}
        idleText={splitFile ? undefined : t("pdf.idle.empty")}
        onCancel={split.cancel}
      >
        <Button
          appearance="primary"
          icon={<DocumentSplit24Regular />}
          disabled={!splitFile || split.running}
          onClick={startSplit}
        >
          {t("pdf.split.action")}
        </Button>
      </ActionBar>
    </Page>
  );
}

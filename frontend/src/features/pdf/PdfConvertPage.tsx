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
  Tab,
  TabList,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  Delete16Regular,
  DocumentPdf24Regular,
  FolderOpen16Regular,
  ImageArrowForward24Regular,
  ArrowRight16Regular,
} from "@fluentui/react-icons";
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
import { AfterGallery } from "../../components/AfterGallery";

interface ConvertImagesResult {
  files: string[];
  count: number;
  outDir: string;
}

interface ImagesToPdfResult {
  outPath: string;
  pageCount: number;
  bytes: number;
}

const useStyles = makeStyles({
  tabsContainer: {
    marginBottom: "4px",
  },
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
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginTop: "16px",
    maxWidth: "520px",
  },
  imagesList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "8px",
  },
  imageItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
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
  name: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export default function PdfConvertPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_convert")!;

  const [convertSubTab, setConvertSubTab] = useState<"pdfToImages" | "imagesToPdf">("pdfToImages");
  const [convertPdfFile, setConvertPdfFile] = useState<string | null>(null);
  const [convertFormat, setConvertFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [convertDpi, setConvertDpi] = useState<number>(150);
  const [imageFiles, setImageFiles] = useState<string[]>([]);

  useIncomingTransfer("pdf_convert", (files, subTab) => {
    if (subTab === "imagesToPdf" || files.some((f) => /\.(png|jpe?g|webp|bmp|gif|tif|tiff)$/i.test(f))) {
      setConvertSubTab("imagesToPdf");
      setImageFiles((prev) => Array.from(new Set([...prev, ...files])));
    } else if (subTab === "pdfToImages" || files.some((f) => /\.pdf$/i.test(f))) {
      setConvertSubTab("pdfToImages");
      if (files[0]) setConvertPdfFile(files[0]);
    }
  });

  const toImages = useJobRunner<ConvertImagesResult>("pdf.to_images", {
    onDone: (result) =>
      notify.success(t("pdf.toast.toImagesSuccess", { count: result.count }), {
        body: result.outDir,
        action: { label: t("common.showInFolder"), onClick: () => api.system.openPath(result.outDir).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.toImagesError"), { body: error }),
  });

  const fromImages = useJobRunner<ImagesToPdfResult>("pdf.from_images", {
    onDone: (result) =>
      notify.success(t("pdf.toast.fromImagesSuccess", { count: result.pageCount }), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.fromImagesError"), { body: error }),
  });

  const startToImages = async () => {
    if (!convertPdfFile) return;
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;
    toImages.start(() => api.pdf.toImages(convertPdfFile, outDir, convertFormat, convertDpi)).catch((err) => notify.error(String(err)));
  };

  const startFromImages = async () => {
    if (!imageFiles.length) return;
    const outPath = await api.dialogs.saveFile(t("pdf.convert.defaultPdfName"), ["PDF (*.pdf)"]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".pdf") ? outPath : `${outPath}.pdf`;
    fromImages.start(() => api.pdf.fromImages(imageFiles, target)).catch((err) => notify.error(String(err)));
  };

  const isBusy = toImages.running || fromImages.running;

  return (
    <Page title={t("tools.pdf_convert.name")} description={t("tools.pdf_convert.description")} icon={tool.icon} accent={tool.accent}>
      <div className={styles.tabsContainer}>
        <TabList
          selectedValue={convertSubTab}
          onTabSelect={(_, d) => setConvertSubTab(d.value as "pdfToImages" | "imagesToPdf")}
        >
          <Tab value="pdfToImages" icon={<DocumentPdf24Regular />}>
            {t("pdf.convert.pdfToImages")}
          </Tab>
          <Tab value="imagesToPdf" icon={<ImageArrowForward24Regular />}>
            {t("pdf.convert.imagesToPdf")}
          </Tab>
        </TabList>
      </div>

      {convertSubTab === "pdfToImages" ? (
        <>
          <DropZone
            compact={!!convertPdfFile}
            icon={DocumentPdf24Regular}
            title={convertPdfFile ? t("pdf.dropChange") : t("pdf.dropSingleTitle")}
            hint={t("pdf.dropSingleHint")}
            accept={[".pdf"]}
            onFiles={(files) => files[0] && setConvertPdfFile(files[0])}
            onBrowse={async () => {
              const files = await api.dialogs.openFiles(["PDF (*.pdf)"], false);
              if (files[0]) setConvertPdfFile(files[0]);
            }}
          />

          {convertPdfFile && (
            <Panel
              title={t("pdf.selectedFile")}
              actions={
                <div style={{ display: "flex", gap: "6px" }}>
                  <Button
                    appearance="subtle"
                    icon={<ArrowRight16Regular />}
                    onClick={() => useTransferStore.getState().openModal([convertPdfFile], "pdf_convert")}
                  >
                    {t("transfer.sendTo")}
                  </Button>
                  <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => setConvertPdfFile(null)}>
                    {t("common.remove")}
                  </Button>
                </div>
              }
            >
              <div className={styles.fileItem}>
                <div className={styles.fileInfo}>
                  <DocumentPdf24Regular fontSize={28} />
                  <div className={styles.fileMeta}>
                    <Subtitle2 className={styles.fileNameText}>{fileName(convertPdfFile)}</Subtitle2>
                    <br />
                    <Caption1 className={styles.muted}>{convertPdfFile}</Caption1>
                  </div>
                </div>
              </div>

              <div className={styles.settingsRow}>
                <Field label={t("pdf.convert.format")}>
                  <Dropdown
                    value={convertFormat.toUpperCase()}
                    selectedOptions={[convertFormat]}
                    onOptionSelect={(_, d) => setConvertFormat(d.optionValue as "png" | "jpeg" | "webp")}
                  >
                    <Option value="png">PNG</Option>
                    <Option value="jpeg">JPEG</Option>
                    <Option value="webp">WebP</Option>
                  </Dropdown>
                </Field>

                <Field label={t("pdf.convert.dpi")}>
                  <Dropdown
                    value={`${convertDpi} DPI`}
                    selectedOptions={[String(convertDpi)]}
                    onOptionSelect={(_, d) => setConvertDpi(Number(d.optionValue))}
                  >
                    <Option value="96">96 DPI (Web)</Option>
                    <Option value="150">150 DPI (Zrównoważona)</Option>
                    <Option value="300">300 DPI (Druk / Wysoka jakość)</Option>
                  </Dropdown>
                </Field>
              </div>

              {toImages.result && (
                <>
                  <Card className={styles.resultCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Badge appearance="filled" color="success" icon={<CheckmarkCircle16Filled />}>
                        {t("pdf.toast.toImagesSuccess", { count: toImages.result.count })}
                      </Badge>
                    </div>
                    <Caption1 className={styles.muted}>{toImages.result.outDir}</Caption1>
                  </Card>

                  {toImages.result.files && toImages.result.files.length > 0 && (
                    <AfterGallery
                      title={t("transfer.extractedTitle")}
                      files={toImages.result.files}
                      outputDir={toImages.result.outDir}
                      sourceToolId="pdf_convert"
                    />
                  )}
                </>
              )}
            </Panel>
          )}

          <ActionBar
            job={toImages.job}
            idleText={convertPdfFile ? undefined : t("pdf.idle.empty")}
            onCancel={toImages.cancel}
          >
            <Button
              appearance="primary"
              icon={<ImageArrowForward24Regular />}
              disabled={!convertPdfFile || isBusy}
              onClick={startToImages}
            >
              {t("pdf.convert.actionToImages")}
            </Button>
          </ActionBar>
        </>
      ) : (
        <>
          <DropZone
            compact={imageFiles.length > 0}
            icon={ImageArrowForward24Regular}
            title={imageFiles.length ? t("pdf.dropMore") : t("pdf.dropImagesTitle")}
            hint={t("pdf.dropImagesHint")}
            accept={[".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]}
            onFiles={(files) => setImageFiles((prev) => [...prev, ...files])}
            onBrowse={async () => {
              const files = await api.dialogs.openFiles(["Images (*.png;*.jpg;*.jpeg;*.webp)"]);
              if (files.length) setImageFiles((prev) => [...prev, ...files]);
            }}
          />

          {imageFiles.length > 0 && (
            <Panel
              title={t("converter.filesSelected", { count: imageFiles.length })}
              actions={
                <div style={{ display: "flex", gap: "6px" }}>
                  <Button
                    appearance="subtle"
                    icon={<ArrowRight16Regular />}
                    onClick={() => useTransferStore.getState().openModal(imageFiles, "pdf_convert")}
                  >
                    {t("transfer.sendTo")}
                  </Button>
                  <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => setImageFiles([])}>
                    {t("common.clearAll")}
                  </Button>
                </div>
              }
            >
              <div className={styles.imagesList}>
                {imageFiles.slice(0, 10).map((f) => (
                  <div key={f} className={styles.imageItem}>
                    <Caption1 className={styles.name}>{fileName(f)}</Caption1>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<ArrowRight16Regular />}
                        aria-label={t("transfer.sendTo")}
                        title={t("transfer.sendTo")}
                        onClick={() => useTransferStore.getState().openModal([f], "pdf_convert")}
                      />
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<Delete16Regular />}
                        onClick={() => setImageFiles(imageFiles.filter((item) => item !== f))}
                      />
                    </div>
                  </div>
                ))}
                {imageFiles.length > 10 && (
                  <Caption1 className={styles.muted}>+ {imageFiles.length - 10} więcej…</Caption1>
                )}
              </div>

              {fromImages.result && (
                <Card className={styles.resultCard}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Badge appearance="filled" color="success" icon={<CheckmarkCircle16Filled />}>
                      {t("pdf.toast.fromImagesSuccess", { count: fromImages.result.pageCount })}
                    </Badge>
                  </div>
                  <Caption1 className={styles.muted}>{fromImages.result.outPath}</Caption1>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      size="small"
                      icon={<FolderOpen16Regular />}
                      onClick={() => api.system.reveal(fromImages.result!.outPath).catch(() => undefined)}
                    >
                      {t("common.showInFolder")}
                    </Button>
                    <Button
                      size="small"
                      icon={<ArrowRight16Regular />}
                      onClick={() => useTransferStore.getState().openModal([fromImages.result!.outPath], "pdf_convert")}
                    >
                      {t("transfer.sendTo")}
                    </Button>
                  </div>
                </Card>
              )}
            </Panel>
          )}

          <ActionBar
            job={fromImages.job}
            idleText={imageFiles.length ? undefined : t("converter.idle.pickFiles")}
            onCancel={fromImages.cancel}
          >
            <Button
              appearance="primary"
              icon={<DocumentPdf24Regular />}
              disabled={!imageFiles.length || isBusy}
              onClick={startFromImages}
            >
              {t("pdf.convert.actionFromImages")}
            </Button>
          </ActionBar>
        </>
      )}
    </Page>
  );
}

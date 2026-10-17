import { useState } from "react";
import {
  Button,
  Caption1,
  Dropdown,
  Field,
  makeStyles,
  Option,
  Tab,
  TabList,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  Delete16Regular,
  DocumentPdf24Regular,
  ImageArrowForward24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { AfterGallery } from "../../components/AfterGallery";
import { DropZone } from "../../components/DropZone";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { dialogFilter, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";
import { SinglePdfTool } from "./SinglePdfTool";

const PDFABLE_EXTENSIONS = [...IMAGE_EXTENSIONS, ".gif"];
const VISIBLE_IMAGES = 10;

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

type ImageFormat = "png" | "jpeg" | "webp";

const useStyles = makeStyles({
  settingsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    maxWidth: "520px",
  },
  imagesList: { display: "flex", flexDirection: "column", gap: "4px" },
  imageItem: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  name: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  muted: { color: tokens.colorNeutralForeground3 },
});

export default function PdfConvertPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_convert")!;

  const [subTab, setSubTab] = useState<"pdfToImages" | "imagesToPdf">("pdfToImages");
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [format, setFormat] = useState<ImageFormat>("png");
  const [dpi, setDpi] = useState<number>(150);
  const [imageFiles, setImageFiles] = useState<string[]>([]);

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

  const changePdf = (next: string | null) => {
    setPdfFile(next);
    toImages.reset();
  };

  const changeImages = (next: string[]) => {
    setImageFiles(next);
    fromImages.reset();
  };

  useIncomingTransfer("pdf_convert", (files, incomingTab) => {
    if (incomingTab === "imagesToPdf" || files.some((f) => /\.(png|jpe?g|webp|bmp|gif|tif|tiff)$/i.test(f))) {
      setSubTab("imagesToPdf");
      changeImages(Array.from(new Set([...imageFiles, ...files])));
    } else if (incomingTab === "pdfToImages" || files.some((f) => /\.pdf$/i.test(f))) {
      setSubTab("pdfToImages");
      if (files[0]) changePdf(files[0]);
    }
  });

  const startToImages = async () => {
    if (!pdfFile) return;
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;
    toImages.start(() => api.pdf.toImages(pdfFile, outDir, format, dpi)).catch((err) => notify.error(String(err)));
  };

  const startFromImages = async () => {
    if (!imageFiles.length) return;
    const outPath = await api.dialogs.saveFile(t("pdf.convert.defaultPdfName"), [dialogFilter(t, "pdf")]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".pdf") ? outPath : `${outPath}.pdf`;
    fromImages.start(() => api.pdf.fromImages(imageFiles, target)).catch((err) => notify.error(String(err)));
  };

  const isBusy = toImages.running || fromImages.running;

  const dpiOptions = [
    { value: 96, label: t("pdf.convert.dpiScreen") },
    { value: 150, label: t("pdf.convert.dpiStandard") },
    { value: 300, label: t("pdf.convert.dpiPrint") },
  ].map((o) => ({ ...o, label: `${o.label} · ${o.value} DPI` }));

  return (
    <Page title={t("tools.pdf_convert.name")} description={t("tools.pdf_convert.description")} icon={tool.icon} accent={tool.accent}>
      <TabList selectedValue={subTab} onTabSelect={(_, d) => setSubTab(d.value as "pdfToImages" | "imagesToPdf")}>
        <Tab value="pdfToImages" icon={<DocumentPdf24Regular />}>
          {t("pdf.convert.pdfToImages")}
        </Tab>
        <Tab value="imagesToPdf" icon={<ImageArrowForward24Regular />}>
          {t("pdf.convert.imagesToPdf")}
        </Tab>
      </TabList>

      {subTab === "pdfToImages" ? (
        <SinglePdfTool
          toolId="pdf_convert"
          file={pdfFile}
          onFileChange={changePdf}
          job={toImages.job}
          onCancel={toImages.cancel}
          action={
            <Button appearance="primary" icon={<ImageArrowForward24Regular />} disabled={!pdfFile || isBusy} onClick={startToImages}>
              {t("pdf.convert.actionToImages")}
            </Button>
          }
          result={
            toImages.result &&
            toImages.result.files?.length > 0 && (
              <AfterGallery
                title={t("transfer.extractedTitle")}
                summary={t("pdf.toast.toImagesSuccess", { count: toImages.result.count })}
                files={toImages.result.files}
                outputDir={toImages.result.outDir}
                sourceToolId="pdf_convert"
              />
            )
          }
        >
          <div className={styles.settingsRow}>
            <Field label={t("pdf.convert.format")}>
              <Dropdown
                value={format.toUpperCase()}
                selectedOptions={[format]}
                onOptionSelect={(_, d) => setFormat(d.optionValue as ImageFormat)}
              >
                <Option value="png">PNG</Option>
                <Option value="jpeg">JPEG</Option>
                <Option value="webp">WebP</Option>
              </Dropdown>
            </Field>
            <Field label={t("pdf.convert.dpi")}>
              <Dropdown
                value={dpiOptions.find((o) => o.value === dpi)?.label}
                selectedOptions={[String(dpi)]}
                onOptionSelect={(_, d) => setDpi(Number(d.optionValue))}
              >
                {dpiOptions.map((o) => (
                  <Option key={o.value} value={String(o.value)}>
                    {o.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          </div>
        </SinglePdfTool>
      ) : (
        <>
          <DropZone
            compact={imageFiles.length > 0}
            icon={ImageArrowForward24Regular}
            title={imageFiles.length ? t("pdf.dropMore") : t("pdf.dropImagesTitle")}
            hint={t("pdf.dropImagesHint")}
            accept={PDFABLE_EXTENSIONS}
            onFiles={(files) => changeImages([...imageFiles, ...files])}
            onBrowse={async () => {
              const files = await api.dialogs.openFiles([dialogFilter(t, "images", PDFABLE_EXTENSIONS)]);
              if (files.length) changeImages([...imageFiles, ...files]);
            }}
          />

          {imageFiles.length > 0 && (
            <Panel
              title={t("converter.filesSelected", { count: imageFiles.length })}
              actions={
                <>
                  {!fromImages.result && (
                    <Button
                      appearance="subtle"
                      icon={<ArrowRight16Regular />}
                      onClick={() => useTransferStore.getState().openModal(imageFiles, "pdf_convert")}
                    >
                      {t("transfer.sendTo")}
                    </Button>
                  )}
                  <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => changeImages([])}>
                    {t("common.clearAll")}
                  </Button>
                </>
              }
            >
              <div className={styles.imagesList}>
                {imageFiles.slice(0, VISIBLE_IMAGES).map((f) => (
                  <div key={f} className={styles.imageItem}>
                    <Caption1 className={styles.name}>{fileName(f)}</Caption1>
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<Delete16Regular />}
                      aria-label={t("common.remove")}
                      onClick={() => changeImages(imageFiles.filter((item) => item !== f))}
                    />
                  </div>
                ))}
                {imageFiles.length > VISIBLE_IMAGES && (
                  <Caption1 className={styles.muted}>{t("common.andMore", { count: imageFiles.length - VISIBLE_IMAGES })}</Caption1>
                )}
              </div>

              {fromImages.result && (
                <ResultCard
                  title={t("pdf.toast.fromImagesSuccess", { count: fromImages.result.pageCount })}
                  path={fromImages.result.outPath}
                  sourceToolId="pdf_convert"
                />
              )}
            </Panel>
          )}

          <ActionBar
            job={fromImages.job}
            idleText={imageFiles.length ? undefined : t("converter.idle.pickFiles")}
            onCancel={fromImages.cancel}
          >
            <Button appearance="primary" icon={<DocumentPdf24Regular />} disabled={!imageFiles.length || isBusy} onClick={startFromImages}>
              {t("pdf.convert.actionFromImages")}
            </Button>
          </ActionBar>
        </>
      )}
    </Page>
  );
}

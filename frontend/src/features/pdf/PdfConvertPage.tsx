import { Button, Field, Input, makeStyles, Tab, TabList } from "@fluentui/react-components";
import { DocumentPdf24Regular, Image16Regular, ImageArrowForward24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { FileList } from "../../components/FileList";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { api } from "../../lib/bridge";
import { ALL_IMAGE_EXTENSIONS, dialogFilter, formatList, formatOptions } from "../../lib/fileTypes";
import { joinPath } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { SinglePdfTool } from "./SinglePdfTool";
import { errorMessage } from "../../lib/errors";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { addUnique } from "../../lib/fileList";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { PDF_IMAGE_FORMATS, usePdfConvertForm } from "./store";

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
  settingsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    maxWidth: "520px",
  },
  rangeField: { maxWidth: "360px" },
});

export default function PdfConvertPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const form = usePdfConvertForm();
  const { subTab, pdfFile, format, dpi, pageRange, imageFiles } = form;
  const outputDir = useOutputDir(form.outputDir);
  const setPageRange = (next: string) => form.set({ pageRange: next });
  const setOutputDir = (dir: string) => form.set({ outputDir: dir });

  const toImages = useJobRunner<ConvertImagesResult>("pdf.to_images", {
    onError: (error) => notify.error(t("pdf.toast.toImagesError"), { body: error }),
  });

  const fromImages = useJobRunner<ImagesToPdfResult>("pdf.from_images", {
    onError: (error) => notify.error(t("pdf.toast.fromImagesError"), { body: error }),
  });

  const changePdf = (next: string | null) => {
    form.set({ pdfFile: next, pageRange: "" });
    toImages.reset();
  };

  const changeImages = (next: string[]) => {
    form.set({ imageFiles: next });
    fromImages.reset();
  };

  const addImages = (files: string[]) => changeImages(addUnique(usePdfConvertForm.getState().imageFiles, files));
  const browseImages = async () => addImages(await api.dialogs.openFiles([dialogFilter(t, "images", ALL_IMAGE_EXTENSIONS)]));

  useIncomingTransfer("pdf_convert", (files, incomingTab) => {
    if (incomingTab === "imagesToPdf" || files.some((f) => /\.(png|jpe?g|webp|bmp|gif|tif|tiff)$/i.test(f))) {
      form.set({ subTab: "imagesToPdf" });
      addImages(files);
    } else if (incomingTab === "pdfToImages" || files.some((f) => /\.pdf$/i.test(f))) {
      form.set({ subTab: "pdfToImages" });
      if (files[0]) changePdf(files[0]);
    }
  });

  const isBusy = toImages.running || fromImages.running;
  const canToImages = !!pdfFile && !isBusy && !!outputDir;
  const canFromImages = imageFiles.length > 0 && !isBusy && !!outputDir;

  const startToImages = () => {
    if (!pdfFile) return;
    toImages.start(() => api.pdf.toImages(pdfFile, outputDir, format, dpi, pageRange)).catch((err) => notify.error(errorMessage(t, err)));
  };

  const startFromImages = () => {
    if (!imageFiles.length) return;
    const target = joinPath(outputDir, t("pdf.convert.defaultPdfName"));
    fromImages.start(() => api.pdf.fromImages(imageFiles, target)).catch((err) => notify.error(errorMessage(t, err)));
  };

  useToolShortcuts(subTab === "imagesToPdf" ? { run: canFromImages && startFromImages, open: browseImages } : {});

  const dpiOptions = [
    { value: 96, label: t("pdf.convert.dpiScreen") },
    { value: 150, label: t("pdf.convert.dpiStandard") },
    { value: 300, label: t("pdf.convert.dpiPrint") },
  ].map((o) => ({ ...o, label: `${o.label} · ${o.value} DPI` }));

  return (
    <ToolPage toolId="pdf_convert">
      <TabList selectedValue={subTab} onTabSelect={(_, d) => form.set({ subTab: d.value as "pdfToImages" | "imagesToPdf" })}>
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
          onRun={canToImages && startToImages}
          outputDir={form.outputDir}
          onOutputDirChange={setOutputDir}
          action={
            <Button appearance="primary" icon={<ImageArrowForward24Regular />} disabled={!canToImages} onClick={startToImages}>
              {t("pdf.convert.actionToImages")}
            </Button>
          }
          pageRange={{ value: pageRange, onChange: setPageRange }}
          result={
            toImages.result &&
            toImages.result.files?.length > 0 && (
              <ResultCard
                title={t("pdf.toast.toImagesSuccess", { count: toImages.result.count })}
                path={toImages.result.outDir}
                folder
                files={toImages.result.files}
                sourceToolId="pdf_convert"
              />
            )
          }
        >
          <div className={styles.settingsRow}>
            <Field label={t("pdf.convert.format")}>
              <Select searchable options={formatOptions(PDF_IMAGE_FORMATS)} value={format} onChange={(next) => form.set({ format: next })} />
            </Field>
            <Field label={t("pdf.convert.dpi")}>
              <Select
                options={dpiOptions.map((o) => ({ value: String(o.value), label: o.label }))}
                value={String(dpi)}
                onChange={(v) => form.set({ dpi: Number(v) })}
              />
            </Field>
          </div>
          <Field label={t("pdf.convert.pages")} className={styles.rangeField}>
            <Input value={pageRange} placeholder={t("pdf.convert.allPages")} onChange={(_, d) => setPageRange(d.value)} />
          </Field>
        </SinglePdfTool>
      ) : (
        <>
          <DropZone
            compact={imageFiles.length > 0}
            fill={imageFiles.length === 0}
            icon={ImageArrowForward24Regular}
            title={imageFiles.length ? t("pdf.dropMore") : t("pdf.dropImagesTitle")}
            hint={t("pdf.dropImagesHint", { formats: formatList(ALL_IMAGE_EXTENSIONS) })}
            accept={ALL_IMAGE_EXTENSIONS}
            onFiles={addImages}
            onBrowse={browseImages}
          />

          {imageFiles.length > 0 && (
            <Panel title={t("converter.filesSelected", { count: imageFiles.length })}>
              <FileList files={imageFiles} icon={<Image16Regular />} onChange={changeImages} sourceToolId="pdf_convert" sortable />

              <OutputFolderField value={form.outputDir} onChange={setOutputDir} />

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
            idleText={imageFiles.length ? t("common.idle.filesReady", { count: imageFiles.length }) : t("converter.idle.pickFiles")}
            onCancel={fromImages.cancel}
          >
            <Button appearance="primary" icon={<DocumentPdf24Regular />} disabled={!canFromImages} onClick={startFromImages}>
              {t("pdf.convert.actionFromImages")}
            </Button>
          </ActionBar>
        </>
      )}
    </ToolPage>
  );
}

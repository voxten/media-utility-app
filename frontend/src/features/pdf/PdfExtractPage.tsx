import { Button } from "@fluentui/react-components";
import { DocumentExtract24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { fileName, formatBytes, joinPath } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { SinglePdfTool } from "./SinglePdfTool";
import { errorMessage } from "../../lib/errors";
import { useOutputDir } from "../../components/OutputFolderField";
import { usePdfExtractForm } from "./store";

interface ExtractTextResult {
  outPath: string;
  charCount: number;
  bytes: number;
}

export default function PdfExtractPage() {
  const { t } = useTranslation();
  const notify = useNotify();

  const form = usePdfExtractForm();
  const { file } = form;
  const outputDir = useOutputDir(form.outputDir);

  const extract = useJobRunner<ExtractTextResult>("pdf.extract_text", {
    onError: (error) => notify.error(t("pdf.toast.extractError"), { body: error }),
  });

  const changeFile = (next: string | null) => {
    form.set({ file: next });
    extract.reset();
  };

  useIncomingTransfer("pdf_extract", (files) => {
    if (files[0]) changeFile(files[0]);
  });

  const canStart = !!file && !extract.running && !!outputDir;
  const start = () => {
    if (!file) return;
    const target = joinPath(outputDir, `${fileName(file).replace(/\.pdf$/i, "")}.txt`);
    extract.start(() => api.pdf.extractText(file, target)).catch((err) => notify.error(errorMessage(t, err)));
  };

  return (
    <ToolPage toolId="pdf_extract">
      <SinglePdfTool
        toolId="pdf_extract"
        file={file}
        onFileChange={changeFile}
        job={extract.job}
        onCancel={extract.cancel}
        onRun={canStart && start}
        outputDir={form.outputDir}
        onOutputDirChange={(dir) => form.set({ outputDir: dir })}
        action={
          <Button appearance="primary" icon={<DocumentExtract24Regular />} disabled={!canStart} onClick={start}>
            {t("pdf.extract.action")}
          </Button>
        }
        result={
          extract.result && (
            <ResultCard
              title={t("pdf.toast.extractSuccess")}
              detail={`${formatBytes(extract.result.bytes)} · ${t("pdf.extract.chars", { count: extract.result.charCount })}`}
              path={extract.result.outPath}
              sourceToolId="pdf_extract"
            />
          )
        }
      />
    </ToolPage>
  );
}

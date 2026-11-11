import { useState } from "react";
import { Button } from "@fluentui/react-components";
import { DocumentExtract24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { dialogFilter } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { SinglePdfTool } from "./SinglePdfTool";
import { errorMessage } from "../../lib/errors";

interface ExtractTextResult {
  outPath: string;
  charCount: number;
  bytes: number;
}

export default function PdfExtractPage() {
  const { t } = useTranslation();
  const notify = useNotify();

  const [file, setFile] = useState<string | null>(null);

  const extract = useJobRunner<ExtractTextResult>("pdf.extract_text", {
    onError: (error) => notify.error(t("pdf.toast.extractError"), { body: error }),
  });

  const changeFile = (next: string | null) => {
    setFile(next);
    extract.reset();
  };

  useIncomingTransfer("pdf_extract", (files) => {
    if (files[0]) changeFile(files[0]);
  });

  const start = async () => {
    if (!file) return;
    const defaultName = `${fileName(file).replace(/\.pdf$/i, "")}.txt`;
    const outPath = await api.dialogs.saveFile(defaultName, [dialogFilter(t, "text")]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".txt") ? outPath : `${outPath}.txt`;
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
        action={
          <Button appearance="primary" icon={<DocumentExtract24Regular />} disabled={!file || extract.running} onClick={start}>
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

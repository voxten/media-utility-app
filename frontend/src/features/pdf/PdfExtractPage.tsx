import { useState } from "react";
import { Button } from "@fluentui/react-components";
import { DocumentExtract24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { dialogFilter } from "../../lib/fileTypes";
import { fileName, formatBytes } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { SinglePdfTool } from "./SinglePdfTool";

interface ExtractTextResult {
  outPath: string;
  charCount: number;
  bytes: number;
}

export default function PdfExtractPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const tool = toolById("pdf_extract")!;

  const [file, setFile] = useState<string | null>(null);

  const extract = useJobRunner<ExtractTextResult>("pdf.extract_text", {
    onDone: (result) =>
      notify.success(t("pdf.toast.extractSuccess"), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      }),
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
    extract.start(() => api.pdf.extractText(file, target)).catch((err) => notify.error(String(err)));
  };

  return (
    <Page title={t("tools.pdf_extract.name")} description={t("tools.pdf_extract.description")} icon={tool.icon} accent={tool.accent}>
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
    </Page>
  );
}

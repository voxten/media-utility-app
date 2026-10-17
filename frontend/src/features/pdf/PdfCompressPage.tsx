import { useState } from "react";
import { Button, Dropdown, Field, makeStyles, Option } from "@fluentui/react-components";
import { DocumentCompress24Regular } from "../../app/customIcons";
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

interface CompressResult {
  inPath: string;
  outPath: string;
  inBytes: number;
  outBytes: number;
  savedBytes: number;
  savedPercent: number;
}

type Preset = "low" | "balanced" | "high";

const useStyles = makeStyles({
  field: { minWidth: "260px", maxWidth: "400px" },
});

export default function PdfCompressPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_compress")!;

  const [file, setFile] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("balanced");

  const compress = useJobRunner<CompressResult>("pdf.compress", {
    onDone: (result) =>
      notify.success(t("pdf.toast.compressSuccess"), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.compressError"), { body: error }),
  });

  const changeFile = (next: string | null) => {
    setFile(next);
    compress.reset();
  };

  useIncomingTransfer("pdf_compress", (files) => {
    if (files[0]) changeFile(files[0]);
  });

  const start = async () => {
    if (!file) return;
    const defaultName = `${fileName(file).replace(/\.pdf$/i, "")}_compressed.pdf`;
    const outPath = await api.dialogs.saveFile(defaultName, [dialogFilter(t, "pdf")]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".pdf") ? outPath : `${outPath}.pdf`;
    compress.start(() => api.pdf.compress(file, target, preset)).catch((err) => notify.error(String(err)));
  };

  const presetLabel: Record<Preset, string> = {
    balanced: t("pdf.compress.presetBalanced"),
    high: t("pdf.compress.presetHigh"),
    low: t("pdf.compress.presetLow"),
  };

  return (
    <Page title={t("tools.pdf_compress.name")} description={t("tools.pdf_compress.description")} icon={tool.icon} accent={tool.accent}>
      <SinglePdfTool
        toolId="pdf_compress"
        file={file}
        onFileChange={changeFile}
        job={compress.job}
        onCancel={compress.cancel}
        action={
          <Button appearance="primary" icon={<DocumentCompress24Regular />} disabled={!file || compress.running} onClick={start}>
            {t("pdf.compress.action")}
          </Button>
        }
        result={
          compress.result && (
            <ResultCard
              title={t("pdf.toast.compressSuccess")}
              detail={t("pdf.compress.result", {
                before: formatBytes(compress.result.inBytes),
                after: formatBytes(compress.result.outBytes),
                percent: compress.result.savedPercent,
              })}
              path={compress.result.outPath}
              sourceToolId="pdf_compress"
            />
          )
        }
      >
        <Field label={t("pdf.compress.preset")} className={styles.field}>
          <Dropdown
            value={presetLabel[preset]}
            selectedOptions={[preset]}
            onOptionSelect={(_, d) => setPreset(d.optionValue as Preset)}
          >
            {(["balanced", "high", "low"] as const).map((p) => (
              <Option key={p} value={p}>
                {presetLabel[p]}
              </Option>
            ))}
          </Dropdown>
        </Field>
      </SinglePdfTool>
    </Page>
  );
}

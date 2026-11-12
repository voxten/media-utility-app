import { Button, Field, makeStyles } from "@fluentui/react-components";
import { DocumentCompress24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { api } from "../../lib/bridge";
import { fileName, formatBytes, joinPath } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { SinglePdfTool } from "./SinglePdfTool";
import { errorMessage } from "../../lib/errors";
import { useOutputDir } from "../../components/OutputFolderField";
import { usePdfCompressForm, type CompressPreset } from "./store";

interface CompressResult {
  inPath: string;
  outPath: string;
  inBytes: number;
  outBytes: number;
  savedBytes: number;
  savedPercent: number;
  noGain?: boolean;
}

const useStyles = makeStyles({
  field: { minWidth: "260px", maxWidth: "400px" },
});

export default function PdfCompressPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const form = usePdfCompressForm();
  const { file, preset } = form;
  const outputDir = useOutputDir(form.outputDir);

  const compress = useJobRunner<CompressResult>("pdf.compress", {
    onError: (error) => notify.error(t("pdf.toast.compressError"), { body: error }),
  });

  const changeFile = (next: string | null) => {
    form.set({ file: next });
    compress.reset();
  };

  useIncomingTransfer("pdf_compress", (files) => {
    if (files[0]) changeFile(files[0]);
  });

  const canStart = !!file && !compress.running && !!outputDir;
  const start = () => {
    if (!file) return;
    const target = joinPath(outputDir, `${fileName(file).replace(/\.pdf$/i, "")}_compressed.pdf`);
    compress.start(() => api.pdf.compress(file, target, preset)).catch((err) => notify.error(errorMessage(t, err)));
  };

  const presetLabel: Record<CompressPreset, string> = {
    balanced: t("pdf.compress.presetBalanced"),
    high: t("pdf.compress.presetHigh"),
    low: t("pdf.compress.presetLow"),
  };

  return (
    <ToolPage toolId="pdf_compress">
      <SinglePdfTool
        toolId="pdf_compress"
        file={file}
        onFileChange={changeFile}
        job={compress.job}
        onCancel={compress.cancel}
        onRun={canStart && start}
        outputDir={form.outputDir}
        onOutputDirChange={(dir) => form.set({ outputDir: dir })}
        action={
          <Button appearance="primary" icon={<DocumentCompress24Regular />} disabled={!canStart} onClick={start}>
            {t("pdf.compress.action")}
          </Button>
        }
        result={
          compress.result && (
            <ResultCard
              title={t("pdf.toast.compressSuccess")}
              detail={
                compress.result.noGain
                  ? t("pdf.compress.noGain", { size: formatBytes(compress.result.inBytes) })
                  : t("pdf.compress.result", {
                      before: formatBytes(compress.result.inBytes),
                      after: formatBytes(compress.result.outBytes),
                      percent: compress.result.savedPercent,
                    })
              }
              path={compress.result.outPath}
              sourceToolId="pdf_compress"
            />
          )
        }
      >
        <Field label={t("pdf.compress.preset")} className={styles.field}>
          <Select
            options={(["balanced", "high", "low"] as const).map((p) => ({ value: p, label: presetLabel[p] }))}
            value={preset}
            onChange={(next) => form.set({ preset: next })}
          />
        </Field>
      </SinglePdfTool>
    </ToolPage>
  );
}

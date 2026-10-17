import { useState } from "react";
import { Button, Field, Input, makeStyles, Radio, RadioGroup } from "@fluentui/react-components";
import { DocumentSplit24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { toolById } from "../../app/tools";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { SinglePdfTool } from "./SinglePdfTool";

interface SplitResult {
  files: string[];
  count: number;
  outDir: string;
}

type SplitMode = "all" | "range";

const useStyles = makeStyles({
  rangeField: { maxWidth: "360px" },
});

export default function PdfSplitPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("pdf_split")!;

  const [file, setFile] = useState<string | null>(null);
  const [mode, setMode] = useState<SplitMode>("all");
  const [range, setRange] = useState("1-3, 5");

  const split = useJobRunner<SplitResult>("pdf.split", {
    onDone: (result) =>
      notify.success(t("pdf.toast.splitSuccess", { count: result.count }), {
        body: result.outDir,
        action: { label: t("common.showInFolder"), onClick: () => api.system.openPath(result.outDir).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.splitError"), { body: error }),
  });

  const changeFile = (next: string | null) => {
    setFile(next);
    split.reset();
  };

  useIncomingTransfer("pdf_split", (files) => {
    if (files[0]) changeFile(files[0]);
  });

  const start = async () => {
    if (!file) return;
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;
    split.start(() => api.pdf.split(file, outDir, mode, range)).catch((err) => notify.error(String(err)));
  };

  return (
    <Page title={t("tools.pdf_split.name")} description={t("tools.pdf_split.description")} icon={tool.icon} accent={tool.accent}>
      <SinglePdfTool
        toolId="pdf_split"
        file={file}
        onFileChange={changeFile}
        job={split.job}
        onCancel={split.cancel}
        action={
          <Button appearance="primary" icon={<DocumentSplit24Regular />} disabled={!file || split.running} onClick={start}>
            {t("pdf.split.action")}
          </Button>
        }
        result={
          split.result && (
            <ResultCard
              title={t("pdf.toast.splitSuccess", { count: split.result.count })}
              path={split.result.outDir}
              folder
              files={split.result.files}
              sourceToolId="pdf_split"
            />
          )
        }
      >
        <Field label={t("pdf.split.mode")}>
          <RadioGroup value={mode} onChange={(_, d) => setMode(d.value as SplitMode)}>
            <Radio value="all" label={t("pdf.split.modeAll")} />
            <Radio value="range" label={t("pdf.split.modeRange")} />
          </RadioGroup>
        </Field>

        {mode === "range" && (
          <Field label={t("pdf.split.rangeLabel")} className={styles.rangeField}>
            <Input value={range} placeholder={t("pdf.split.rangePlaceholder")} onChange={(_, d) => setRange(d.value)} />
          </Field>
        )}
      </SinglePdfTool>
    </Page>
  );
}

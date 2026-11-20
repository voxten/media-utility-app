import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Field,
  makeStyles,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Switch,
  Text,
  Textarea,
  tokens,
} from "@fluentui/react-components";
import { ClipboardPaste16Regular, Copy16Regular, Save16Regular, ScanText24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { Columns } from "../../components/Columns";
import { DropZone } from "../../components/DropZone";
import { FileStrip } from "../../components/FileStrip";
import { useNotify } from "../../components/notify";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { api } from "../../lib/bridge";
import { errorMessage } from "../../lib/errors";
import { allFilesFilter, dialogFilter, formatList } from "../../lib/fileTypes";
import { fileName, joinPath } from "../../lib/format";
import { isTypingTarget } from "../../lib/keyboard";
import type { OcrImagesResult, OcrLanguage, OcrPdfResult } from "../../lib/types";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { useSettings } from "../../stores/settings";
import { defaultLanguage, isPdf, languageOptions, OCR_EXTENSIONS, pickSources } from "./sources";
import { useOcrForm } from "./store";

type OcrResult = OcrImagesResult | OcrPdfResult;

const isPdfResult = (result: OcrResult): result is OcrPdfResult => "pageCount" in result;
const stem = (path: string) => fileName(path).replace(/\.[^.]+$/, "");

const useStyles = makeStyles({
  text: { width: "100%" },
  textarea: { minHeight: "320px", fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  empty: { color: tokens.colorNeutralForeground3 },
});

export default function OcrPage() {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const savedLanguage = useSettings((s) => s.settings?.ocrLanguage);
  const updateSettings = useSettings((s) => s.update);
  const form = useOcrForm();
  const { sources } = form;
  const outputDir = useOutputDir(form.outputDir);
  const [languages, setLanguages] = useState<OcrLanguage[] | null>(null);
  const [languagesError, setLanguagesError] = useState("");
  const [selected, setSelected] = useState(0);
  const [autoRun, setAutoRun] = useState(false);

  const job = useJobRunner<OcrResult>("ocr", {
    onResult: (result) => useOcrForm.getState().set({ text: result.text }),
    onError: (err) => notify.error(t("ocr.errors.run"), { body: err }),
  });

  useEffect(() => {
    api.ocr
      .languages()
      .then((list) => {
        setLanguages(list);
        setLanguagesError(list.length ? "" : t("errors.ocrNoLanguage"));
      })
      .catch((err) => {
        setLanguages([]);
        setLanguagesError(errorMessage(t, err));
      });
  }, [t]);

  const language = defaultLanguage(languages ?? [], savedLanguage, i18n.language);
  const options = useMemo(() => languageOptions(languages ?? [], i18n.language), [languages, i18n.language]);
  const pdf = sources.length === 1 && isPdf(sources[0]);
  const ready = languages !== null && !languagesError;

  const run = (paths: string[]) => {
    if (!paths.length) return;
    const launch = isPdf(paths[0])
      ? () =>
          api.ocr.pdf({
            path: paths[0],
            language,
            ...(form.searchablePdf && outputDir ? { outPath: joinPath(outputDir, `${stem(paths[0])}_ocr.pdf`) } : {}),
          })
      : () => api.ocr.images({ paths, language });
    job.start(launch).catch((err) => notify.error(t("ocr.errors.run"), { body: errorMessage(t, err) }));
  };

  const accept = (paths: string[]) => {
    const picked = pickSources(paths);
    if (picked.skipped > 0) notify.warning(t("common.skippedFiles", { count: picked.skipped }));
    if (!picked.sources.length) return;
    job.reset();
    setSelected(0);
    form.set({ sources: picked.sources, text: "" });
    setAutoRun(!isPdf(picked.sources[0]));
  };
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  const paste = useCallback(async () => {
    try {
      const paths = await api.ocr.clipboardImage();
      if (paths.length) acceptRef.current(paths);
      else notify.warning(t("ocr.noClipboardImage"));
    } catch (err) {
      notify.error(t("ocr.errors.run"), { body: errorMessage(t, err) });
    }
  }, [notify, t]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const types = Array.from(e.clipboardData?.types ?? []);
      const hasFiles = types.includes("Files");
      if (!hasFiles && (isTypingTarget(e.target) || types.includes("text/plain"))) return;
      e.preventDefault();
      paste();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [paste]);

  useEffect(() => {
    if (!autoRun || languages === null) return;
    setAutoRun(false);
    if (!languagesError) run(sources);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per accepted set of files, when the languages are known
  }, [autoRun, languages]);

  useIncomingTransfer("ocr", (files) => accept(files));

  const browse = async () => {
    const paths = await api.dialogs.openFiles(
      [dialogFilter(t, "imagesAndPdf"), allFilesFilter(t)],
      true,
    );
    if (paths.length) accept(paths);
  };

  const removeSource = (index: number) => {
    const next = sources.filter((_, i) => i !== index);
    form.set({ sources: next });
    setSelected((s) => Math.min(s, Math.max(0, next.length - 1)));
  };

  const pickLanguage = (tag: string) => {
    updateSettings({ ocrLanguage: tag }).catch(() => undefined);
  };

  const copy = () => {
    navigator.clipboard
      ?.writeText(form.text)
      .then(() => notify.success(t("ocr.copied")))
      .catch(() => undefined);
  };

  const saveText = async () => {
    try {
      const out = await api.dialogs.saveFile(`${sources[0] ? stem(sources[0]) : "text"}.txt`, [dialogFilter(t, "text")]);
      if (!out) return;
      await api.ocr.saveText(form.text, out);
      notify.success(t("ocr.saved"));
    } catch (err) {
      notify.error(t("ocr.errors.save"), { body: errorMessage(t, err) });
    }
  };

  const canStart = sources.length > 0 && ready && !job.running && (!pdf || !form.searchablePdf || !!outputDir);
  const start = () => canStart && run(sources);

  useToolShortcuts({ run: canStart && start, open: browse });

  const pasteButton = (
    <Button icon={<ClipboardPaste16Regular />} onClick={paste}>
      {t("ocr.paste")}
    </Button>
  );

  const languageError = languagesError && (
    <MessageBar intent="warning" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>{t("ocr.errors.languages")}</MessageBarTitle>
        {languagesError}
      </MessageBarBody>
    </MessageBar>
  );

  if (!sources.length) {
    return (
      <ToolPage toolId="ocr" actions={pasteButton}>
        {languageError}
        <DropZone
          fill
          icon={ScanText24Regular}
          title={t("ocr.dropTitle")}
          hint={t("ocr.dropHint", { formats: formatList(OCR_EXTENSIONS) })}
          accept={OCR_EXTENSIONS}
          onFiles={accept}
          onBrowse={browse}
        />
      </ToolPage>
    );
  }

  const result = job.result;
  const pdfResult = result && isPdfResult(result) ? result : null;

  const settingsPanel = (
    <Panel>
      <Field label={t("ocr.language")}>
        <Select
          searchable={options.length > 8}
          options={options}
          value={language}
          disabled={!options.length}
          onChange={pickLanguage}
        />
      </Field>
      {pdf && (
        <>
          <Switch
            checked={form.searchablePdf}
            label={t("ocr.searchablePdf")}
            onChange={(_, d) => form.set({ searchablePdf: d.checked })}
          />
          {form.searchablePdf && (
            <OutputFolderField value={form.outputDir} onChange={(dir) => form.set({ outputDir: dir })} />
          )}
        </>
      )}
    </Panel>
  );

  return (
    <ToolPage toolId="ocr" actions={pasteButton}>
      {languageError}
      <Columns side={settingsPanel}>
        <Panel title={pdf ? fileName(sources[0]) : t("common.filesTitle", { count: sources.length })}>
          {!pdf && (
            <FileStrip files={sources} selected={selected} onSelect={setSelected} onRemove={removeSource} />
          )}
          <DropZone
            compact
            title={t("ocr.change")}
            accept={OCR_EXTENSIONS}
            onFiles={accept}
            onBrowse={browse}
          />
        </Panel>

        {pdfResult?.outPath && (
          <ResultCard
            title={t("ocr.pdfDone")}
            detail={t("ocr.pdfDetail", { recognized: pdfResult.recognized, total: pdfResult.pageCount })}
            path={pdfResult.outPath}
            sourceToolId="ocr"
          />
        )}
        {pdfResult && form.searchablePdf && !pdfResult.outPath && pdfResult.recognized === 0 && (
          <MessageBar intent="info">
            <MessageBarBody>{t("ocr.pdfHadText")}</MessageBarBody>
          </MessageBar>
        )}

        {(result || form.text) && (
          <Panel
            title={t("ocr.text")}
            actions={
              <>
                <Button appearance="subtle" icon={<Copy16Regular />} disabled={!form.text} onClick={copy}>
                  {t("common.copy")}
                </Button>
                <Button appearance="subtle" icon={<Save16Regular />} disabled={!form.text} onClick={saveText}>
                  {t("ocr.saveTxt")}
                </Button>
              </>
            }
          >
            {result && !result.text && !form.text ? (
              <Text className={styles.empty}>{t("ocr.noText")}</Text>
            ) : (
              <Textarea
                className={styles.text}
                textarea={{ className: styles.textarea, spellCheck: false }}
                resize="vertical"
                value={form.text}
                aria-label={t("ocr.text")}
                onChange={(_, d) => form.set({ text: d.value })}
              />
            )}
          </Panel>
        )}
      </Columns>

      <ActionBar job={job.job} idleText={t("common.idle.ready")} onCancel={job.cancel}>
        <Button appearance="primary" icon={<ScanText24Regular />} disabled={!canStart} onClick={start}>
          {t("ocr.start")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

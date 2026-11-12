// Layout shared by PDF tools that work on one document: drop zone, selected file with options, result,
// page previews and the action bar.

import { useMemo, type ReactNode } from "react";
import { Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowRight16Regular, Delete16Regular, DocumentPdf24Regular, ErrorCircle24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { Columns } from "../../components/Columns";
import { DropZone } from "../../components/DropZone";
import { EmptyState } from "../../components/EmptyState";
import { OutputFolderField } from "../../components/OutputFolderField";
import { Panel } from "../../components/Panel";
import { api } from "../../lib/bridge";
import { dialogFilter, PDF_EXTENSIONS } from "../../lib/fileTypes";
import { dirName, fileName } from "../../lib/format";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import type { JobState } from "../../stores/jobs";
import { useTransferStore } from "../../stores/transfer";
import { formatPageRange, parsePageRange } from "./pageRange";
import { PdfPageGrid, type PageMark } from "./PdfPageGrid";
import { usePdfPagePreview } from "./PdfPagePreview";
import { usePdfPages } from "./usePdfPages";

const useStyles = makeStyles({
  muted: { color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
});

interface SinglePdfToolProps {
  toolId: string;
  file: string | null;
  onFileChange: (file: string | null) => void;
  job?: JobState;
  onCancel: () => void;
  /** Primary action button(s) for the action bar. */
  action: ReactNode;
  /** What Ctrl+Enter does; falsy while the action is disabled. */
  onRun?: (() => void) | false;
  /** Folder picked in the tool ("" = the default output folder). */
  outputDir: string;
  onOutputDirChange: (dir: string) => void;
  /** Result of the last run; while shown it carries "Send to" for the output instead of the input. */
  result?: ReactNode;
  /** Tool options shown under the selected file. */
  children?: ReactNode;
  /** Page range text ("1-3, 5") that the page grid shows and edits by clicking pages. */
  pageRange?: { value: string; onChange: (range: string) => void };
  /** Coloured page groups the tool manages itself; `toolbar` goes in the page grid's header. */
  pageMarks?: {
    marks: Map<number, PageMark>;
    onToggle: (page: number, extend: boolean) => void;
    toolbar?: ReactNode;
  };
}

export function SinglePdfTool({
  toolId,
  file,
  onFileChange,
  job,
  onCancel,
  action,
  onRun,
  outputDir,
  onOutputDirChange,
  result,
  children,
  pageRange,
  pageMarks,
}: SinglePdfToolProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { pages, loading, error } = usePdfPages(file);
  const preview = usePdfPagePreview();

  const range = pageRange?.value ?? "";
  const selected = useMemo(() => new Set(parsePageRange(range, pages.length)), [range, pages.length]);
  const togglePage = (page: number) => {
    if (!pageRange) return;
    const next = new Set(selected);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    pageRange.onChange(formatPageRange(next));
  };

  const browse = async () => {
    const [picked] = await api.dialogs.openFiles([dialogFilter(t, "pdf")], false);
    if (picked) onFileChange(picked);
  };

  useToolShortcuts({ run: onRun, open: browse });

  const dropZone = (
    <DropZone
      compact={!!file}
      fill={!file}
      icon={DocumentPdf24Regular}
      title={file ? t("pdf.dropChange") : t("pdf.dropSingleTitle")}
      hint={t("pdf.dropSingleHint")}
      accept={PDF_EXTENSIONS}
      onFiles={(files) => files[0] && onFileChange(files[0])}
      onBrowse={browse}
    />
  );

  const filePanel = file && (
    <Panel
      title={fileName(file)}
      actions={
        <>
          {!result && (
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([file], toolId)}
            >
              {t("transfer.sendTo")}
            </Button>
          )}
          <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => onFileChange(null)}>
            {t("common.remove")}
          </Button>
        </>
      }
    >
      <Caption1 className={styles.muted}>
        {pages.length && !loading ? `${dirName(file)} · ${t("pdf.pageCount", { count: pages.length })}` : dirName(file)}
      </Caption1>
      {children}
      <OutputFolderField value={outputDir} onChange={onOutputDirChange} />
      {result}
    </Panel>
  );

  return (
    <>
      {file ? (
        <Columns side={filePanel}>
          {dropZone}
          <Panel title={t("pdf.pagesTitle")} actions={pageMarks?.toolbar}>
            {error ? (
              <EmptyState icon={ErrorCircle24Regular} title={error} />
            ) : (
              <PdfPageGrid
                pages={pages}
                loading={loading}
                selected={pageRange ? selected : undefined}
                marks={pageMarks?.marks}
                onToggle={pageMarks?.onToggle ?? (pageRange ? togglePage : undefined)}
                onPreview={preview.show}
              />
            )}
          </Panel>
        </Columns>
      ) : (
        dropZone
      )}
      {preview.dialog}

      <ActionBar job={job} idleText={file ? t("common.idle.ready") : t("pdf.idle.empty")} onCancel={onCancel}>
        {action}
      </ActionBar>
    </>
  );
}

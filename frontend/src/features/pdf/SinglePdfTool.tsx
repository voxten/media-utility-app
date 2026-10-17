// Layout shared by PDF tools that work on one document: drop zone, selected file with options, result, action bar.

import type { ReactNode } from "react";
import { Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowRight16Regular, Delete16Regular, DocumentPdf24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { Panel } from "../../components/Panel";
import { api } from "../../lib/bridge";
import { dialogFilter, PDF_EXTENSIONS } from "../../lib/fileTypes";
import { dirName, fileName } from "../../lib/format";
import type { JobState } from "../../stores/jobs";
import { useTransferStore } from "../../stores/transfer";

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
  /** Result of the last run; while shown it carries "Send to" for the output instead of the input. */
  result?: ReactNode;
  /** Tool options shown under the selected file. */
  children?: ReactNode;
}

export function SinglePdfTool({ toolId, file, onFileChange, job, onCancel, action, result, children }: SinglePdfToolProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  const browse = async () => {
    const [picked] = await api.dialogs.openFiles([dialogFilter(t, "pdf")], false);
    if (picked) onFileChange(picked);
  };

  return (
    <>
      <DropZone
        compact={!!file}
        icon={DocumentPdf24Regular}
        title={file ? t("pdf.dropChange") : t("pdf.dropSingleTitle")}
        hint={t("pdf.dropSingleHint")}
        accept={PDF_EXTENSIONS}
        onFiles={(files) => files[0] && onFileChange(files[0])}
        onBrowse={browse}
      />

      {file && (
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
          <Caption1 className={styles.muted}>{dirName(file)}</Caption1>
          {children}
          {result}
        </Panel>
      )}

      <ActionBar job={job} idleText={file ? undefined : t("pdf.idle.empty")} onCancel={onCancel}>
        {action}
      </ActionBar>
    </>
  );
}

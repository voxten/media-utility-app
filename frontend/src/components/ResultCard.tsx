// Inline confirmation shown after a tool writes its output, with "Show in folder" and "Send to".

import {
  Button,
  Caption1,
  makeStyles,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  tokens,
} from "@fluentui/react-components";
import { ArrowRight16Regular, FolderOpen16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useOpenPath } from "../lib/useOpenPath";
import { useTransferStore } from "../stores/transfer";

const useStyles = makeStyles({
  title: { display: "block" },
  detail: { display: "block", color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
});

interface ResultCardProps {
  title: string;
  /** Output file, or the output folder when `folder` is set. */
  path: string;
  folder?: boolean;
  /** Files offered to "Send to"; defaults to `path` for a file result. */
  files?: string[];
  sourceToolId: string;
  detail?: string;
}

export function ResultCard({ title, path, folder, files, sourceToolId, detail }: ResultCardProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { openPath, reveal } = useOpenPath();
  const sendable = files ?? (folder ? [] : [path]);
  const show = () => (folder ? openPath(path) : reveal(path));

  return (
    <MessageBar intent="success" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle className={styles.title}>{title}</MessageBarTitle>
        <Caption1 className={styles.detail}>{[detail, path].filter(Boolean).join(" · ")}</Caption1>
      </MessageBarBody>
      <MessageBarActions>
        <Button size="small" icon={<FolderOpen16Regular />} onClick={show}>
          {t("common.showInFolder")}
        </Button>
        {sendable.length > 0 && (
          <Button
            size="small"
            icon={<ArrowRight16Regular />}
            onClick={() => useTransferStore.getState().openModal(sendable, sourceToolId)}
          >
            {t("transfer.sendTo")}
          </Button>
        )}
      </MessageBarActions>
    </MessageBar>
  );
}

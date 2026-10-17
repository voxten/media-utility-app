// Inline confirmation shown after a tool writes its output, with "Show in folder" and "Send to".

import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import { ArrowRight16Regular, FolderOpen16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { useTransferStore } from "../stores/transfer";

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
  const { t } = useTranslation();
  const sendable = files ?? (folder ? [] : [path]);
  const show = () => (folder ? api.system.openPath(path) : api.system.reveal(path)).catch(() => undefined);

  return (
    <MessageBar intent="success" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>{title}</MessageBarTitle>
        {[detail, path].filter(Boolean).join(" · ")}
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

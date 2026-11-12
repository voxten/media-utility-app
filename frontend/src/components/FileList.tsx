// Compact list of chosen files with remove, clear all and "Send to".

import type { ReactElement } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { ArrowRight16Regular, Delete16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { fileName } from "../lib/format";
import { useTransferStore } from "../stores/transfer";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: "2px", maxHeight: "180px", overflowY: "auto" },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 4px 4px 10px",
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  name: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { display: "flex", gap: "8px" },
});

interface FileListProps {
  files: string[];
  icon: ReactElement;
  onChange: (files: string[]) => void;
  sourceToolId: string;
}

export function FileList({ files, icon, onChange, sourceToolId }: FileListProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (!files.length) return null;

  return (
    <>
      <div className={styles.list}>
        {files.map((file) => (
          <div key={file} className={styles.item} title={file}>
            {icon}
            <Text className={styles.name}>{fileName(file)}</Text>
            <Button
              appearance="subtle"
              size="small"
              icon={<Delete16Regular />}
              aria-label={t("common.remove")}
              onClick={() => onChange(files.filter((f) => f !== file))}
            />
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <Button appearance="subtle" size="small" onClick={() => onChange([])}>
          {t("common.clearAll")}
        </Button>
        <Button
          appearance="subtle"
          size="small"
          icon={<ArrowRight16Regular />}
          onClick={() => useTransferStore.getState().openModal(files, sourceToolId)}
        >
          {t("transfer.sendTo")}
        </Button>
      </div>
    </>
  );
}

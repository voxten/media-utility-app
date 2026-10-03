import { Button, Input, makeStyles, Tooltip } from "@fluentui/react-components";
import { Dismiss16Regular, FolderOpen20Regular, Open16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";

const useStyles = makeStyles({
  root: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    width: "100%",
  },
  actionBtn: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
});

interface PathPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** folder → folder picker; file → open-file dialog; save → save dialog */
  mode?: "folder" | "file" | "save";
  fileTypes?: string[];
  placeholder?: string;
  defaultFileName?: string;
  clearable?: boolean;
  /** Show a button that opens the selected folder in Explorer. */
  openable?: boolean;
  ariaLabel?: string;
}

export function PathPicker({
  value,
  onChange,
  mode = "folder",
  fileTypes,
  placeholder,
  defaultFileName,
  clearable,
  openable,
  ariaLabel,
}: PathPickerProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  const browse = async () => {
    let picked: string | null | undefined;
    if (mode === "folder") picked = await api.dialogs.openFolder(value);
    else if (mode === "file") picked = (await api.dialogs.openFiles(fileTypes, false))[0];
    else picked = await api.dialogs.saveFile(defaultFileName ?? "", fileTypes);
    if (picked) onChange(picked);
  };

  return (
    <div className={styles.root}>
      <Input
        className={styles.input}
        value={value}
        onChange={(_, data) => onChange(data.value)}
        placeholder={placeholder ?? t("common.selectFolder")}
        aria-label={ariaLabel}
        contentAfter={
          clearable && value ? (
            <Button appearance="transparent" size="small" icon={<Dismiss16Regular />} aria-label={t("common.clear")} onClick={() => onChange("")} />
          ) : undefined
        }
      />
      {openable && value && (
        <Tooltip content={t("common.openFolder")} relationship="label">
          <Button className={styles.actionBtn} icon={<Open16Regular />} onClick={() => api.system.openPath(value).catch(() => undefined)} />
        </Tooltip>
      )}
      <Button className={styles.actionBtn} icon={<FolderOpen20Regular />} onClick={browse}>
        {t("common.browse")}
      </Button>
    </div>
  );
}

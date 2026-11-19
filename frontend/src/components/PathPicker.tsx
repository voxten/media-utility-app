import { useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Tooltip } from "@fluentui/react-components";
import { Dismiss16Regular, FolderOpen20Regular, Open16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { useOpenPath } from "../lib/useOpenPath";

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

// Below this width (e.g. in a Columns side panel) "Browse" becomes an icon button so the path stays readable.
const NARROW_WIDTH = 380;

function useIsNarrow() {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, narrow] as const;
}

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
  disabled?: boolean;
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
  disabled,
}: PathPickerProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { openPath } = useOpenPath();
  const [rootRef, narrow] = useIsNarrow();

  const browse = async () => {
    let picked: string | null | undefined;
    if (mode === "folder") picked = await api.dialogs.openFolder(value);
    else if (mode === "file") picked = (await api.dialogs.openFiles(fileTypes, false))[0];
    else picked = await api.dialogs.saveFile(defaultFileName ?? "", fileTypes);
    if (picked) onChange(picked);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <Input
        className={styles.input}
        value={value}
        onChange={(_, data) => onChange(data.value)}
        placeholder={placeholder ?? t("common.selectFolder")}
        aria-label={ariaLabel}
        disabled={disabled}
        contentAfter={
          clearable && value ? (
            <Button appearance="transparent" size="small" icon={<Dismiss16Regular />} aria-label={t("common.clear")} disabled={disabled} onClick={() => onChange("")} />
          ) : undefined
        }
      />
      {openable && value && (
        <Tooltip content={t("common.openFolder")} relationship="label">
          <Button className={styles.actionBtn} icon={<Open16Regular />} onClick={() => openPath(value)} />
        </Tooltip>
      )}
      {narrow ? (
        <Tooltip content={t("common.browse")} relationship="label">
          <Button className={styles.actionBtn} icon={<FolderOpen20Regular />} disabled={disabled} onClick={browse} />
        </Tooltip>
      ) : (
        <Button className={styles.actionBtn} icon={<FolderOpen20Regular />} disabled={disabled} onClick={browse}>
          {t("common.browse")}
        </Button>
      )}
    </div>
  );
}

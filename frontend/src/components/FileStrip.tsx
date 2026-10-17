// Horizontal strip of image thumbnails for tools that work on several files with one shared viewer.

import { useEffect, useState, type ReactNode } from "react";
import { Button, makeStyles, mergeClasses, Spinner, tokens, Tooltip } from "@fluentui/react-components";
import { Dismiss12Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { fileName } from "../lib/format";

// Thumbnails survive page switches; previews are keyed by path and never change for a given file.
const thumbCache = new Map<string, string>();

const useStyles = makeStyles({
  root: { display: "flex", alignItems: "center", gap: "12px", minWidth: 0 },
  strip: { display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px", scrollbarWidth: "thin", flexGrow: 1, minWidth: 0 },
  actions: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: "4px", flexShrink: 0 },
  item: {
    position: "relative",
    flexShrink: 0,
    width: "96px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "4px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid transparent`,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
  },
  selected: {
    border: `1px solid ${tokens.colorCompoundBrandStroke}`,
    backgroundColor: tokens.colorSubtleBackgroundSelected,
  },
  thumb: {
    height: "64px",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
  },
  img: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  name: {
    fontSize: tokens.fontSizeBase100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  edited: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1 },
  remove: { position: "absolute", top: "6px", right: "6px", minWidth: "20px", width: "20px", height: "20px", padding: 0 },
});

interface FileStripProps {
  files: string[];
  selected: number;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  /** Files with unsaved edits; their names are highlighted. */
  edited?: Set<string>;
  /** Actions on the whole list (apply to all, clear), shown next to the thumbnails. */
  actions?: ReactNode;
}

export function FileStrip({ files, selected, onSelect, onRemove, edited, actions }: FileStripProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [, setLoaded] = useState(0);

  useEffect(() => {
    let current = true;
    for (const file of files) {
      if (thumbCache.has(file)) continue;
      api.image_editor
        .loadPreview(file)
        .then((p) => {
          thumbCache.set(file, p.dataUrl);
          if (current) setLoaded((n) => n + 1);
        })
        .catch(() => undefined);
    }
    return () => {
      current = false;
    };
  }, [files]);

  return (
    <div className={styles.root}>
      <div className={styles.strip} role="listbox" aria-label={t("common.files")}>
        {files.map((file, i) => {
          const thumb = thumbCache.get(file);
          return (
            <div
              key={file}
              role="option"
              aria-selected={i === selected}
              title={file}
              className={mergeClasses(styles.item, i === selected && styles.selected)}
              onClick={() => onSelect(i)}
            >
              <div className={styles.thumb}>
                {thumb ? <img className={styles.img} src={thumb} alt="" loading="lazy" /> : <Spinner size="extra-tiny" />}
              </div>
              <span className={mergeClasses(styles.name, edited?.has(file) && styles.edited)}>{fileName(file)}</span>
              <Tooltip content={t("common.remove")} relationship="label">
                <Button
                  className={styles.remove}
                  size="small"
                  appearance="subtle"
                  icon={<Dismiss12Regular />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

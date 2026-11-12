import { useMemo } from "react";
import {
  Badge,
  Button,
  Caption1,
  makeStyles,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  FolderOpen16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useOpenPath } from "../lib/useOpenPath";
import { fileName, formatBytes } from "../lib/format";
import { useTransferStore } from "../stores/transfer";
import { FileThumbnail } from "./FileThumbnail";
import { Panel } from "./Panel";

export interface AfterGalleryItem {
  file: string;
  dest?: string;
  name?: string;
  originalSize?: number;
  size?: number;
  savedPercent?: number;
  /** Shown instead of the saving, e.g. when the original was kept. */
  note?: string;
  width?: number;
  height?: number;
  dataUrl?: string;
}

interface AfterGalleryProps {
  title: string;
  items?: AfterGalleryItem[];
  files?: string[];
  outputDir?: string;
  sourceToolId?: string;
  /** One-line result summary shown next to the title. */
  summary?: string;
}

const useStyles = makeStyles({
  titleGroup: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    flexWrap: "wrap",
  },
  summary: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "12px",
    maxHeight: "440px",
    overflowY: "auto",
  },
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    minWidth: 0,
  },
  thumbBox: {
    width: "100%",
    aspectRatio: "1 / 1",
    maxHeight: "140px",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
  },
  thumbImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    minWidth: 0,
  },
  fileName: {
    flexGrow: 1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "4px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
});

export function AfterGallery({ title, items, files, outputDir, sourceToolId, summary }: AfterGalleryProps) {
  const { t } = useTranslation();
  const { openPath, reveal } = useOpenPath();
  const styles = useStyles();

  const normalizedItems = useMemo<AfterGalleryItem[]>(() => {
    if (items && items.length > 0) return items;
    if (files && files.length > 0) return files.map((f) => ({ file: f, dest: f, name: fileName(f) }));
    return [];
  }, [items, files]);

  const allDestFiles = useMemo(
    () => normalizedItems.map((it) => it.dest || it.file).filter((p): p is string => Boolean(p)),
    [normalizedItems]
  );

  if (!normalizedItems.length) return null;

  return (
    <Panel
      title={
        <span className={styles.titleGroup}>
          {title}
          {summary && <Caption1 className={styles.summary}>{summary}</Caption1>}
        </span>
      }
      actions={
        <>
          {outputDir && (
            <Button
              appearance="subtle"
              icon={<FolderOpen16Regular />}
              onClick={() => openPath(outputDir)}
            >
              {t("transfer.openOutputFolder")}
            </Button>
          )}
          {allDestFiles.length > 0 && (
            <Button
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal(allDestFiles, sourceToolId)}
            >
              {t("transfer.sendAllTo")}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.grid}>
        {normalizedItems.map((item, idx) => {
          const path = item.dest || item.file;
          const name = item.name || fileName(path);

          return (
            <div key={`${path}-${idx}`} className={styles.tile}>
              <div className={styles.thumbBox}>
                {item.dataUrl ? (
                  <img src={item.dataUrl} alt={name} className={styles.thumbImg} loading="lazy" />
                ) : (
                  <FileThumbnail path={path} className={styles.thumbImg} />
                )}
              </div>

              <div className={styles.nameRow}>
                <span className={styles.fileName} title={name}>
                  {name}
                </span>
                <Tooltip content={t("common.showInFolder")} relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<FolderOpen16Regular />}
                    onClick={() => reveal(path)}
                  />
                </Tooltip>
              </div>

              <div className={styles.metaRow}>
                {item.width && item.height ? (
                  <span>
                    {item.width}×{item.height}
                  </span>
                ) : item.originalSize && item.size ? (
                  <span>
                    {formatBytes(item.originalSize)} → {formatBytes(item.size)}
                  </span>
                ) : item.size ? (
                  <span>{formatBytes(item.size)}</span>
                ) : null}

                {item.note ? (
                  <Badge size="small" appearance="tint" color="informative">
                    {item.note}
                  </Badge>
                ) : (
                  item.savedPercent != null &&
                  item.savedPercent > 0 && (
                    <Badge size="small" appearance="tint" color="success">
                      −{item.savedPercent}%
                    </Badge>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

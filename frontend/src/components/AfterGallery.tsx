import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Card,
  makeStyles,
  shorthands,
  Spinner,
  Subtitle2,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  FolderOpen16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { fileName, formatBytes } from "../lib/format";
import { useTransferStore } from "../stores/transfer";

export interface AfterGalleryItem {
  file: string;
  dest?: string;
  name?: string;
  originalSize?: number;
  size?: number;
  savedPercent?: number;
  width?: number;
  height?: number;
  dataUrl?: string;
}

interface AfterGalleryProps {
  title?: string;
  items?: AfterGalleryItem[];
  files?: string[];
  outputDir?: string;
  sourceToolId?: string;
  emptyText?: string;
  /** One-line result summary shown under the title instead of the item count. */
  summary?: string;
}

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "16px",
    padding: "16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "10px",
  },
  titleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  summary: {
    color: tokens.colorNeutralForeground3,
  },
  actionsGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "12px",
    maxHeight: "440px",
    overflowY: "auto",
    padding: "4px",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke3),
    transitionProperty: "box-shadow, transform",
    transitionDuration: tokens.durationFast,
    ":hover": {
      boxShadow: tokens.shadow8,
    },
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
    position: "relative",
  },
  thumbImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },
  cardInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  fileName: {
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
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "4px",
    marginTop: "2px",
    paddingTop: "6px",
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke3),
  },
});

export function AfterGallery({
  title,
  items,
  files,
  outputDir,
  sourceToolId,
  emptyText,
  summary,
}: AfterGalleryProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  // Normalize items list from items or raw files
  const normalizedItems = useMemo<AfterGalleryItem[]>(() => {
    if (items && items.length > 0) {
      return items;
    }
    if (files && files.length > 0) {
      return files.map((f) => ({
        file: f,
        dest: f,
        name: fileName(f),
      }));
    }
    return [];
  }, [items, files]);

  // Extract all valid destination files for batch transfer
  const allDestFiles = useMemo(() => {
    return normalizedItems
      .map((it) => it.dest || it.file)
      .filter((p): p is string => Boolean(p));
  }, [normalizedItems]);

  // Cache thumbnails for files
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const toLoad = normalizedItems.filter((it) => {
      const path = it.dest || it.file;
      return path && !thumbnails[path] && !it.dataUrl;
    });

    toLoad.forEach((it) => {
      const path = it.dest || it.file;
      if (!path) return;
      api.image_editor
        .loadPreview(path)
        .then((res) => {
          if (active && res?.dataUrl) {
            setThumbnails((prev) => ({ ...prev, [path]: res.dataUrl }));
          }
        })
        .catch(() => {
          // If not an image or failed, silently ignore
        });
    });

    return () => {
      active = false;
    };
  }, [normalizedItems, thumbnails]);

  if (!normalizedItems.length) {
    if (!emptyText) return null;
    return (
      <div className={styles.container}>
        <Caption1>{emptyText}</Caption1>
      </div>
    );
  }

  const galleryTitle = title || t("transfer.afterTitle");

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Subtitle2>{galleryTitle}</Subtitle2>
          {summary ? (
            <Caption1 className={styles.summary}>{summary}</Caption1>
          ) : (
            <Badge appearance="filled" color="brand">
              {normalizedItems.length}
            </Badge>
          )}
        </div>

        <div className={styles.actionsGroup}>
          {allDestFiles.length > 0 && (
            <Button
              size="small"
              appearance="primary"
              icon={<ArrowRight16Regular />}
              onClick={() =>
                useTransferStore.getState().openModal(allDestFiles, sourceToolId)
              }
            >
              {t("transfer.sendAllTo")}
            </Button>
          )}

          {outputDir && (
            <Button
              size="small"
              appearance="subtle"
              icon={<FolderOpen16Regular />}
              onClick={() => api.system.openPath(outputDir).catch(() => undefined)}
            >
              {t("transfer.openOutputFolder")}
            </Button>
          )}
        </div>
      </div>

      <div className={styles.grid}>
        {normalizedItems.map((item, idx) => {
          const path = item.dest || item.file;
          const name = item.name || fileName(path);
          const thumbSrc = item.dataUrl || thumbnails[path];

          return (
            <Card key={path ? `${path}-${idx}` : idx} className={styles.card}>
              <div className={styles.thumbBox}>
                {thumbSrc ? (
                  <img src={thumbSrc} alt={name} className={styles.thumbImg} loading="lazy" />
                ) : (
                  <Spinner size="extra-tiny" />
                )}
              </div>

              <div className={styles.cardInfo}>
                <span className={styles.fileName} title={name}>
                  {name}
                </span>

                <div className={styles.metaRow}>
                  {item.width && item.height ? (
                    <span>
                      {item.width}×{item.height}
                    </span>
                  ) : item.originalSize && item.size ? (
                    <span>
                      {formatBytes(item.originalSize)} ➔ {formatBytes(item.size)}
                    </span>
                  ) : item.size ? (
                    <span>{formatBytes(item.size)}</span>
                  ) : (
                    <span>#{idx + 1}</span>
                  )}

                  {item.savedPercent != null && item.savedPercent > 0 && (
                    <Badge size="small" appearance="filled" color="success">
                      -{item.savedPercent}%
                    </Badge>
                  )}
                </div>
              </div>

              <div className={styles.cardFooter}>
                <Tooltip content={t("common.showInFolder")} relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<FolderOpen16Regular />}
                    onClick={() => api.system.reveal(path).catch(() => undefined)}
                  />
                </Tooltip>

                <Button
                  size="small"
                  appearance="subtle"
                  icon={<ArrowRight16Regular />}
                  onClick={() =>
                    useTransferStore.getState().openModal([path], sourceToolId)
                  }
                >
                  {t("transfer.sendTo")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Batch tab: the link list and the per-link queue with progress and totals.

import { Badge, Caption1, makeStyles, ProgressBar, Spinner, Text, Textarea, tokens } from "@fluentui/react-components";
import { CheckmarkCircle16Filled, CheckmarkCircle16Regular, Clock16Regular, DismissCircle16Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { formatBytes, formatDuration } from "../../lib/format";
import { translateMessage } from "../../lib/jobMessage";
import { useDownloadForm } from "./store";
import type { BatchItem } from "./types";

const useStyles = makeStyles({
  panel: { flexGrow: 1, display: "flex", flexDirection: "column", minHeight: "260px" },
  area: {
    flexGrow: 1,
    minHeight: "180px",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    "& textarea": {
      fontFamily: tokens.fontFamilyMonospace,
      maxHeight: "none",
      minHeight: "inherit",
      boxSizing: "border-box",
      flexGrow: 1,
      height: "100%",
    },
  },
  queue: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  icon: { display: "grid", placeItems: "center", flexShrink: 0, width: "20px" },
  content: { flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: tokens.fontSizeBase300 },
  sub: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  meta: { flexShrink: 0, display: "flex", alignItems: "center", gap: "10px" },
  size: { fontVariantNumeric: "tabular-nums", fontWeight: tokens.fontWeightSemibold },
  duration: { fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground3, display: "flex", alignItems: "center", gap: "4px" },
  progress: { width: "140px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "4px" },
  summary: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    padding: "10px 14px",
    marginTop: "10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3 },
  smallIcon: { fontSize: "12px" },
});

interface BatchQueueProps {
  queue: BatchItem[];
  running: boolean;
  totalSize?: number;
  totalDuration?: number;
}

export function BatchQueue({ queue, running, totalSize, totalDuration }: BatchQueueProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const batchText = useDownloadForm((s) => s.batchText);
  const set = useDownloadForm((s) => s.set);
  const doneCount = queue.filter((i) => i.status === "done").length;

  return (
    <Panel className={styles.panel} title={t("download.queueTitle")}>
      <Textarea
        className={styles.area}
        resize="vertical"
        value={batchText}
        placeholder={running ? t("download.batchPlaceholderRunning") : "https://www.youtube.com/watch?v=…\nhttps://x.com/…/status/…"}
        onChange={(_, d) => set({ batchText: d.value })}
      />
      {queue.length > 0 && (
        <div className={styles.queue}>
          {queue.map((item) => {
            const isDone = item.status === "done";
            const isError = item.status === "error";
            const isSkipped = item.status === "skipped";
            const isRunning = item.status === "running" && running;
            const error = item.error ? translateMessage(t, item.error) : undefined;

            return (
              <div key={item.index} className={styles.item} title={error ?? item.url}>
                <div className={styles.icon}>
                  {isDone ? (
                    <CheckmarkCircle16Filled className={styles.ok} />
                  ) : isError ? (
                    <DismissCircle16Filled className={styles.bad} />
                  ) : isSkipped ? (
                    <CheckmarkCircle16Regular className={styles.muted} />
                  ) : isRunning ? (
                    <Spinner size="extra-tiny" />
                  ) : (
                    <Clock16Regular className={styles.muted} />
                  )}
                </div>
                <div className={styles.content}>
                  <Text weight={isRunning ? "semibold" : "medium"} className={styles.title}>
                    {item.title || item.url}
                  </Text>
                  {((isError && error) || item.title) && (
                    <Caption1 className={isError ? styles.bad : styles.sub}>{isError && error ? error : item.url}</Caption1>
                  )}
                </div>
                <div className={styles.meta}>
                  {isRunning ? (
                    <div className={styles.progress}>
                      <ProgressBar value={(item.percent ?? 0) / 100} thickness="medium" />
                    </div>
                  ) : isDone ? (
                    <div className={styles.meta}>
                      {item.size != null && item.size > 0 && (
                        <Badge appearance="tint" color="informative" className={styles.size}>
                          {formatBytes(item.size)}
                        </Badge>
                      )}
                      {item.duration != null && item.duration > 0 && (
                        <Caption1 className={styles.duration}>
                          <Clock16Regular className={styles.smallIcon} />
                          {formatDuration(item.duration)}
                        </Caption1>
                      )}
                    </div>
                  ) : isError ? (
                    <Badge appearance="tint" color="danger">
                      {t("download.itemStatus.error")}
                    </Badge>
                  ) : (
                    <Caption1 className={styles.muted}>{t(isSkipped ? "download.itemStatus.skipped" : "download.itemStatus.pending")}</Caption1>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {doneCount > 0 && (
        <div className={styles.summary}>
          <Text weight="semibold">{t("download.summary", { done: doneCount, total: queue.length })}</Text>
          {totalSize != null && <Caption1 className={styles.muted}>{t("download.totalSize", { size: formatBytes(totalSize) })}</Caption1>}
          {totalDuration != null && (
            <Caption1 className={styles.muted}>{t("download.totalDuration", { duration: formatDuration(totalDuration) })}</Caption1>
          )}
        </div>
      )}
    </Panel>
  );
}

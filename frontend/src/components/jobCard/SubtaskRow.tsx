import { Caption1, mergeClasses, ProgressBar, Spinner, Text } from "@fluentui/react-components";
import { CheckmarkCircle16Filled, Clock16Regular, DismissCircle16Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { formatBytes, formatDuration } from "../../lib/format";
import { translateMessage } from "../../lib/jobMessage";
import { useJobCardStyles } from "./styles";
import { SEPARATOR } from "./summary";
import type { SubtaskAction } from "./targets";

const formatSize = (size: number | undefined) => (size != null && size > 0 ? formatBytes(size) : "");

export function SubtaskRow({ item }: { item: SubtaskAction }) {
  const styles = useJobCardStyles();
  const { t } = useTranslation();

  const isRunning = item.status === "running";
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const displayTitle = translateMessage(t, item.title);

  const side = isDone
    ? formatSize(item.size)
    : isRunning
      ? [
          item.speed != null ? `${formatBytes(item.speed)}/s` : undefined,
          item.eta != null ? t("common.eta", { time: formatDuration(item.eta) }) : undefined,
          item.percent != null ? `${Math.round(item.percent)}%` : undefined,
        ]
          .filter(Boolean)
          .join(SEPARATOR)
      : isError
        ? t("common.jobStatus.error")
        : item.status === "pending"
          ? t("jobs.pending")
          : t(`common.jobStatus.${item.status}`);

  return (
    <div className={styles.subtaskItem} title={displayTitle}>
      <div className={styles.subtaskRow}>
        <div className={styles.subtaskIcon}>
          {isRunning ? (
            <Spinner size="extra-tiny" />
          ) : isDone ? (
            <CheckmarkCircle16Filled className={styles.okIcon} />
          ) : isError ? (
            <DismissCircle16Filled className={styles.badIcon} />
          ) : (
            <Clock16Regular className={styles.muted} />
          )}
        </div>
        <Text size={200} weight={isRunning ? "semibold" : "regular"} className={mergeClasses(styles.subtaskTitle, styles.ellipsis)}>
          {displayTitle}
        </Text>
        <Caption1 className={mergeClasses(styles.infoSide, isError ? styles.badIcon : styles.muted)}>{side}</Caption1>
      </div>
      {isRunning && <ProgressBar value={item.percent == null ? undefined : item.percent / 100} thickness="medium" />}
      {isError && item.error && <Caption1 className={styles.subtaskError}>{item.error}</Caption1>}
    </div>
  );
}

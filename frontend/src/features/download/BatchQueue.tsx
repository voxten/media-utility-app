// Batch tab: the link list and the per-link queue with progress and totals; a running queue can be reordered and links skipped.

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Caption1, makeStyles, mergeClasses, ProgressBar, Spinner, Text, Textarea, tokens, Tooltip } from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  CheckmarkCircle16Regular,
  Clock16Regular,
  Dismiss16Regular,
  DismissCircle16Filled,
  DismissCircle16Regular,
  ReOrderDotsVertical16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { formatBytes, formatDuration } from "../../lib/format";
import { translateMessage } from "../../lib/jobMessage";
import { useSortableAccessibility } from "../../lib/sortableAccessibility";
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
  controllable: { paddingLeft: "6px", paddingRight: "6px" },
  dragging: { position: "relative", zIndex: 1, boxShadow: tokens.shadow8 },
  handle: {
    display: "flex",
    flexShrink: 0,
    width: "16px",
    color: tokens.colorNeutralForeground3,
    cursor: "grab",
    touchAction: "none",
    borderRadius: tokens.borderRadiusSmall,
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  handleSpace: { flexShrink: 0, width: "16px" },
  skipSpace: { flexShrink: 0, width: "24px" },
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
  /** Given while the queue runs: the item indexes in their new order after dragging. */
  onReorder?: (order: number[]) => void;
  /** Given while the queue runs: leaves out a waiting link or stops a running one. */
  onSkip?: (index: number) => void;
}

interface RowProps {
  item: BatchItem;
  running: boolean;
  controllable: boolean;
  onSkip?: (index: number) => void;
}

function QueueRow({ item, running, controllable, onSkip }: RowProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const isSkipped = item.status === "skipped";
  const isCancelled = item.status === "cancelled";
  const isPending = item.status === "pending";
  const isRunning = item.status === "running" && running;
  const draggable = controllable && isPending;
  const skippable = controllable && !!onSkip && (isPending || isRunning);
  const error = item.error ? translateMessage(t, item.error) : undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.index, disabled: !draggable });

  return (
    <div
      ref={setNodeRef}
      style={controllable ? { transform: CSS.Translate.toString(transform), transition } : undefined}
      className={mergeClasses(styles.item, controllable && styles.controllable, isDragging && styles.dragging)}
      title={error ?? item.url}
    >
      {controllable &&
        (draggable ? (
          <span className={styles.handle} {...attributes} {...listeners} aria-label={t("common.dragToReorder")}>
            <ReOrderDotsVertical16Regular />
          </span>
        ) : (
          <span className={styles.handleSpace} />
        ))}
      <div className={styles.icon}>
        {isDone ? (
          <CheckmarkCircle16Filled className={styles.ok} />
        ) : isError ? (
          <DismissCircle16Filled className={styles.bad} />
        ) : isSkipped ? (
          <CheckmarkCircle16Regular className={styles.muted} />
        ) : isCancelled ? (
          <DismissCircle16Regular className={styles.muted} />
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
          <Caption1 className={styles.muted}>
            {isSkipped
              ? t("download.itemStatus.skipped")
              : isCancelled
                ? t("common.jobStatus.cancelled")
                : t("download.itemStatus.pending")}
          </Caption1>
        )}
      </div>
      {controllable &&
        (skippable ? (
          <Tooltip content={t("download.skip")} relationship="label">
            <Button appearance="subtle" size="small" icon={<Dismiss16Regular />} onClick={() => onSkip?.(item.index)} />
          </Tooltip>
        ) : (
          <span className={styles.skipSpace} />
        ))}
    </div>
  );
}

export function BatchQueue({ queue, running, totalSize, totalDuration, onReorder, onSkip }: BatchQueueProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const batchText = useDownloadForm((s) => s.batchText);
  const set = useDownloadForm((s) => s.set);
  const doneCount = queue.filter((i) => i.status === "done").length;
  const controllable = running && !!onReorder;
  const ids = queue.map((item) => item.index);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const accessibility = useSortableAccessibility(ids, (id) => {
    const item = queue.find((i) => i.index === id);
    return item?.title || item?.url || String(id);
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !onReorder) return;
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
  };

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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={accessibility}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className={styles.queue}>
              {queue.map((item) => (
                <QueueRow key={item.index} item={item} running={running} controllable={controllable} onSkip={onSkip} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

// Compact list of chosen files with remove, clear all and "Send to"; optionally reordered by dragging.

import type { ReactElement } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, makeStyles, mergeClasses, Text, tokens } from "@fluentui/react-components";
import { ArrowRight16Regular, Delete16Regular, ReOrderDotsVertical16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { fileName } from "../lib/format";
import { useSortableAccessibility } from "../lib/sortableAccessibility";
import { useTransferStore } from "../stores/transfer";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: "2px", maxHeight: "180px", overflowY: "auto" },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 4px 4px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  dragging: { position: "relative", zIndex: 1, boxShadow: tokens.shadow8 },
  handle: {
    display: "flex",
    color: tokens.colorNeutralForeground3,
    cursor: "grab",
    touchAction: "none",
    borderRadius: tokens.borderRadiusSmall,
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  name: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { display: "flex", gap: "8px" },
});

const fileLabel = (id: UniqueIdentifier) => fileName(String(id));

interface FileListProps {
  files: string[];
  icon: ReactElement;
  onChange: (files: string[]) => void;
  sourceToolId: string;
  /** Files can be dragged into a new order (the order is used by the tool). */
  sortable?: boolean;
}

interface RowProps {
  file: string;
  icon: ReactElement;
  sortable: boolean;
  onRemove: () => void;
}

function FileRow({ file, icon, sortable, onRemove }: RowProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file, disabled: !sortable });

  return (
    <div
      ref={setNodeRef}
      style={sortable ? { transform: CSS.Translate.toString(transform), transition } : undefined}
      className={mergeClasses(styles.item, isDragging && styles.dragging)}
      title={file}
    >
      {sortable && (
        <span className={styles.handle} {...attributes} {...listeners} aria-label={t("common.dragToReorder")}>
          <ReOrderDotsVertical16Regular />
        </span>
      )}
      {icon}
      <Text className={styles.name}>{fileName(file)}</Text>
      <Button appearance="subtle" size="small" icon={<Delete16Regular />} aria-label={t("common.remove")} onClick={onRemove} />
    </div>
  );
}

export function FileList({ files, icon, onChange, sourceToolId, sortable = false }: FileListProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const accessibility = useSortableAccessibility(files, fileLabel);
  if (!files.length) return null;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(files, files.indexOf(String(active.id)), files.indexOf(String(over.id))));
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={accessibility}>
        <SortableContext items={files} strategy={verticalListSortingStrategy}>
          <div className={styles.list}>
            {files.map((file) => (
              <FileRow
                key={file}
                file={file}
                icon={icon}
                sortable={sortable}
                onRemove={() => onChange(files.filter((f) => f !== file))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
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

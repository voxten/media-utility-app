import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  Spinner,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRotateClockwise16Regular,
  ArrowSortDown16Regular,
  Delete16Regular,
  DocumentPdf24Regular,
  Eye16Regular,
  FolderOpen16Regular,
  Merge16Filled,
  ReOrderDotsVertical16Regular,
  ArrowRight16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { api } from "../../lib/bridge";
import { dialogFilter, PDF_EXTENSIONS } from "../../lib/fileTypes";
import { fileName } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { ON_IMAGE } from "../../lib/onImage";
import { useTransferStore } from "../../stores/transfer";
import { groupColor } from "./groupColors";
import { usePdfPagePreview } from "./PdfPagePreview";
import type { PdfPageInfo } from "./usePdfPages";

interface PdfPageItem extends PdfPageInfo {
  key: string;
  rotation?: number;
}

interface InspectResult {
  pages: PdfPageInfo[];
  errors: { file: string; error: string }[];
}

interface MergeResult {
  outPath: string;
  pageCount: number;
  bytes: number;
}

let keySeq = 0;
const withKey = (p: PdfPageInfo): PdfPageItem => ({ ...p, key: `p${++keySeq}` });

const useForm = create<{ pages: PdfPageItem[]; setPages: (pages: PdfPageItem[]) => void }>((set) => ({
  pages: [],
  setPages: (pages) => set({ pages }),
}));

const useStyles = makeStyles({
  toolbar: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "14px",
  },
  card: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "grab",
    touchAction: "none",
    transitionProperty: "box-shadow, border-color",
    transitionDuration: tokens.durationFast,
    ":hover": { boxShadow: tokens.shadow8 },
    ":hover .page-actions": { opacity: 1 },
  },
  dragging: { opacity: 0.35 },
  overlay: { cursor: "grabbing", boxShadow: tokens.shadow28, transform: "rotate(2deg)" },
  thumbBox: {
    aspectRatio: "1 / 1.35",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
  },
  thumb: {
    maxWidth: "100%",
    maxHeight: "100%",
    boxShadow: tokens.shadow4,
    backgroundColor: ON_IMAGE.paper,
    transition: "transform 0.2s ease-in-out",
  },
  meta: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  name: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground2,
  },
  pageNumber: { flexShrink: 0, whiteSpace: "nowrap", color: tokens.colorNeutralForeground3 },
  colorBar: { position: "absolute", left: "10px", right: "10px", top: "0", height: "3px", borderRadius: "0 0 3px 3px" },
  actions: {
    position: "absolute",
    top: "14px",
    right: "14px",
    display: "flex",
    gap: "4px",
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: tokens.durationFast,
  },
  actionButton: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  index: {
    position: "absolute",
    top: "14px",
    left: "14px",
    minWidth: "22px",
    height: "22px",
    padding: "0 6px",
    borderRadius: "11px",
    display: "grid",
    placeItems: "center",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: ON_IMAGE.light,
    backgroundColor: ON_IMAGE.scrim,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  streaming: { opacity: 0.6 },
});

interface CardProps {
  item: PdfPageItem;
  index: number;
  color: string;
  onRemove?: () => void;
  onPreview?: () => void;
  onRotate?: () => void;
  overlay?: boolean;
}

function PageCardView({ item, index, color, onRemove, onPreview, onRotate, overlay }: CardProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <div className={mergeClasses(styles.card, overlay && styles.overlay)}>
      <span className={styles.colorBar} style={{ backgroundColor: color }} />
      <div className={styles.thumbBox}>
        <img
          className={styles.thumb}
          style={{ transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined }}
          src={item.thumb}
          alt=""
          draggable={false}
        />
      </div>
      <span className={styles.index}>{index + 1}</span>
      {!overlay && (
        <div className={`${styles.actions} page-actions`}>
          <Tooltip content={t("pdf.rotateRight")} relationship="label">
            <Button
              size="small"
              className={styles.actionButton}
              icon={<ArrowRotateClockwise16Regular />}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRotate}
            />
          </Tooltip>
          <Tooltip content={t("pdf.preview")} relationship="label">
            <Button
              size="small"
              className={styles.actionButton}
              icon={<Eye16Regular />}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onPreview}
            />
          </Tooltip>
          <Tooltip content={t("pdf.removePage")} relationship="label">
            <Button
              size="small"
              className={styles.actionButton}
              icon={<Delete16Regular />}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRemove}
            />
          </Tooltip>
        </div>
      )}
      <div className={styles.meta}>
        <ReOrderDotsVertical16Regular className={styles.muted} />
        <Caption1 className={styles.name} title={`${item.fileName} · ${t("pdf.pageShort", { page: item.page + 1 })}`}>
          {item.fileName}
        </Caption1>
        <Caption1 className={styles.pageNumber}>{t("pdf.pageShort", { page: item.page + 1 })}</Caption1>
      </div>
    </div>
  );
}

function SortablePageCard(props: CardProps) {
  const styles = useStyles();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? styles.dragging : undefined}
      {...attributes}
      {...listeners}
    >
      <PageCardView {...props} />
    </div>
  );
}

export default function PdfPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const { pages, setPages } = useForm();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const preview = usePdfPagePreview();

  const inspect = useJobRunner<InspectResult>("pdf.inspect", {
    onDone: (result) => {
      setPages([...useForm.getState().pages, ...result.pages.map(withKey)]);
      result.errors.forEach((e) => notify.error(t("pdf.toast.readError", { file: fileName(e.file) }), { body: e.error }));
      inspect.reset();
    },
    onError: (error) => notify.error(t("pdf.toast.readError", { file: "" }), { body: error }),
  });

  const merge = useJobRunner<MergeResult>("pdf.merge", {
    onDone: (result) =>
      notify.success(t("pdf.toast.merged", { count: result.pageCount }), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      }),
    onError: (error) => notify.error(t("pdf.toast.mergeError"), { body: error }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const files = useMemo(() => Array.from(new Set(pages.map((p) => p.file))), [pages]);
  const colorOf = (file: string) => groupColor(Math.max(0, files.indexOf(file)));
  const streaming = (inspect.job?.status === "running" ? inspect.job.partials : []) as PdfPageInfo[];

  const addMergeFiles = (paths: string[]) => {
    const pdfs = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
    if (pdfs.length) inspect.start(() => api.pdf.inspect(pdfs)).catch((err) => notify.error(String(err)));
  };

  useIncomingTransfer("pdf", (files) => {
    addMergeFiles(files);
  });

  const browseMerge = async () => addMergeFiles(await api.dialogs.openFiles([dialogFilter(t, "pdf")]));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null);
    if (!over || active.id === over.id) return;
    const from = pages.findIndex((p) => p.key === active.id);
    const to = pages.findIndex((p) => p.key === over.id);
    setPages(arrayMove(pages, from, to));
  };

  const rotatePage = (key: string) => {
    setPages(pages.map((p) => (p.key === key ? { ...p, rotation: ((p.rotation ?? 0) + 90) % 360 } : p)));
  };

  const startMerge = async () => {
    const outPath = await api.dialogs.saveFile(t("pdf.defaultName"), [dialogFilter(t, "pdf")]);
    if (!outPath) return;
    const target = outPath.toLowerCase().endsWith(".pdf") ? outPath : `${outPath}.pdf`;
    merge
      .start(() =>
        api.pdf.merge(
          pages.map(({ file, page, rotation }) => ({ file, page, rotation: rotation ?? 0 })),
          target,
        ),
      )
      .catch((err) => notify.error(String(err)));
  };

  const sortByFile = () =>
    setPages([...pages].sort((a, b) => files.indexOf(a.file) - files.indexOf(b.file) || a.page - b.page));

  const activeItem = pages.find((p) => p.key === activeKey);
  const busy = inspect.running || merge.running;

  return (
    <ToolPage toolId="pdf">
      <DropZone
        compact={pages.length > 0 || streaming.length > 0}
        icon={DocumentPdf24Regular}
        title={pages.length ? t("pdf.dropMore") : t("pdf.dropTitle")}
        hint={t("pdf.dropHint")}
        accept={PDF_EXTENSIONS}
        onFiles={addMergeFiles}
        onBrowse={browseMerge}
      />

      {(pages.length > 0 || streaming.length > 0) && (
        <Panel
          title={t("pdf.pagesTitle")}
          actions={
            <div className={styles.toolbar}>
              {inspect.running && <Spinner size="tiny" label={t("pdf.loading")} />}
              <Tooltip content={t("pdf.sortByFile")} relationship="label">
                <Button
                  appearance="subtle"
                  icon={<ArrowSortDown16Regular />}
                  disabled={busy || files.length < 2}
                  onClick={sortByFile}
                />
              </Tooltip>
              <Button
                appearance="subtle"
                icon={<ArrowRight16Regular />}
                disabled={busy || files.length === 0}
                onClick={() => useTransferStore.getState().openModal(files, "pdf")}
              >
                {t("transfer.sendTo")}
              </Button>
              <Button appearance="subtle" icon={<Delete16Regular />} disabled={busy} onClick={() => setPages([])}>
                {t("common.clearAll")}
              </Button>
            </div>
          }
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveKey(String(e.active.id))}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveKey(null)}
          >
            <SortableContext items={pages.map((p) => p.key)} strategy={rectSortingStrategy}>
              <div className={styles.grid}>
                {pages.map((item, index) => (
                  <SortablePageCard
                    key={item.key}
                    item={item}
                    index={index}
                    color={colorOf(item.file)}
                    onRemove={() => setPages(pages.filter((p) => p.key !== item.key))}
                    onPreview={() => preview.show(item)}
                    onRotate={() => rotatePage(item.key)}
                  />
                ))}
                {streaming.map((item, i) => (
                  <div key={`s${i}`} className={styles.streaming}>
                    <PageCardView
                      item={{ ...item, key: `s${i}` }}
                      index={pages.length + i}
                      color={tokens.colorNeutralStroke1}
                      overlay
                    />
                  </div>
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeItem && (
                <PageCardView
                  item={activeItem}
                  index={pages.indexOf(activeItem)}
                  color={colorOf(activeItem.file)}
                  overlay
                />
              )}
            </DragOverlay>
          </DndContext>
        </Panel>
      )}

      {merge.job && merge.job.logs.length > 0 && <LogPanel logs={merge.job.logs} />}

      <ActionBar
        job={merge.job ?? inspect.job}
        idleText={pages.length ? t("pdf.idle.ready", { count: pages.length }) : t("pdf.idle.empty")}
        onCancel={merge.running ? merge.cancel : inspect.cancel}
      >
        {merge.result && (
          <>
            <Button
              icon={<FolderOpen16Regular />}
              onClick={() => api.system.reveal(merge.result!.outPath).catch(() => undefined)}
            >
              {t("common.showInFolder")}
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([merge.result!.outPath], "pdf")}
            >
              {t("transfer.sendTo")}
            </Button>
          </>
        )}
        <Button appearance="primary" icon={<Merge16Filled />} disabled={!pages.length || busy} onClick={startMerge}>
          {t("pdf.merge")}
        </Button>
      </ActionBar>

      {preview.dialog}
    </ToolPage>
  );
}

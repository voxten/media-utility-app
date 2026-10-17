import { useMemo } from "react";
import {
  Badge,
  Button,
  Caption1,
  Checkbox,
  Field,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  mergeClasses,
  Tab,
  TabList,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowDownload16Regular,
  CheckmarkStarburst16Filled,
  Delete16Regular,
  FolderOpen16Regular,
  FolderSearch24Regular,
  Image24Regular,
  MoreHorizontal16Regular,
  Open16Regular,
  Search16Filled,
  SelectAllOn16Regular,
  Video24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { confirm } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { dialogFilter } from "../../lib/fileTypes";
import { dirName, formatBytes, formatDuration } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";

type Mode = "image" | "video";

interface MediaItem {
  path: string;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumb: string | null;
}

interface ScanResult {
  groups: MediaItem[][];
  scanned: number;
  failed: number;
  mode: Mode;
}

interface DuplicatesState {
  mode: Mode;
  folder: string;
  threshold: number;
  groups: MediaItem[][] | null;
  scanned: number;
  selected: Set<string>;
  set: (patch: Partial<Omit<DuplicatesState, "set">>) => void;
}

const useForm = create<DuplicatesState>((set) => ({
  mode: "image",
  folder: "",
  threshold: 12,
  groups: null,
  scanned: 0,
  selected: new Set(),
  set: (patch) => set(patch),
}));

/** The file to keep in a group: highest resolution, then the largest file. */
function keeper(group: MediaItem[]): MediaItem {
  return [...group].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) || b.size - a.size)[0];
}

const useStyles = makeStyles({
  setup: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) minmax(220px, 1fr)",
    gap: "20px",
    alignItems: "end",
    "@media (max-width: 850px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: "12px",
    },
  },
  stats: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  groups: { display: "flex", flexDirection: "column", gap: "14px" },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  groupHead: { display: "flex", alignItems: "center", gap: "10px" },
  groupTitle: { flexGrow: 1 },
  items: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" },
  item: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `2px solid transparent`,
    boxShadow: tokens.shadow2,
    cursor: "pointer",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: tokens.durationFast,
    ":hover": { boxShadow: tokens.shadow8 },
  },
  itemSelected: { border: `2px solid ${tokens.colorPaletteRedBorder2}` },
  thumb: {
    aspectRatio: "16 / 10",
    width: "100%",
    objectFit: "cover",
    display: "block",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  noThumb: { aspectRatio: "16 / 10", display: "grid", placeItems: "center", color: tokens.colorNeutralForeground4, backgroundColor: tokens.colorNeutralBackground3 },
  check: { position: "absolute", top: "6px", left: "6px", backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusMedium },
  keep: { position: "absolute", top: "8px", right: "8px" },
  info: { display: "flex", flexDirection: "column", gap: "2px", padding: "8px 10px 10px", minWidth: 0 },
  nameRow: { display: "flex", alignItems: "center", gap: "4px" },
  name: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  muted: { color: tokens.colorNeutralForeground3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

function ItemCard({ item, isKeeper, selected, onToggle, onTrash }: { item: MediaItem; isKeeper: boolean; selected: boolean; onToggle: () => void; onTrash: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const meta = [item.width && item.height ? `${item.width}×${item.height}` : null, formatBytes(item.size), item.duration != null ? formatDuration(item.duration / 1000) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={mergeClasses(styles.item, selected && styles.itemSelected)} onClick={onToggle} title={item.path}>
      {item.thumb ? <img className={styles.thumb} src={item.thumb} alt="" draggable={false} /> : <div className={styles.noThumb}>—</div>}
      <Checkbox className={styles.check} checked={selected} onChange={onToggle} onClick={(e) => e.stopPropagation()} aria-label={t("duplicates.select")} />
      {isKeeper && (
        <Badge className={styles.keep} color="success" icon={<CheckmarkStarburst16Filled />}>
          {t("duplicates.best")}
        </Badge>
      )}
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <Text weight="semibold" size={200} className={styles.name}>
            {item.filename}
          </Text>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" size="small" icon={<MoreHorizontal16Regular />} onClick={(e) => e.stopPropagation()} aria-label={t("common.more")} />
            </MenuTrigger>
            <MenuPopover onClick={(e) => e.stopPropagation()}>
              <MenuList>
                <MenuItem icon={<Open16Regular />} onClick={() => api.system.openPath(item.path)}>
                  {t("common.open")}
                </MenuItem>
                <MenuItem icon={<FolderOpen16Regular />} onClick={() => api.system.reveal(item.path).catch(() => undefined)}>
                  {t("common.showInFolder")}
                </MenuItem>
                <MenuItem icon={<Delete16Regular />} onClick={onTrash}>
                  {t("duplicates.moveToTrash")}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
        <Caption1 className={styles.muted}>{meta}</Caption1>
        <Caption1 className={styles.muted}>{dirName(item.path)}</Caption1>
      </div>
    </div>
  );
}

export default function DuplicatesPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("duplicates")!;
  const form = useForm();

  const runner = useJobRunner<ScanResult>("duplicates", {
    onDone: (result) => {
      form.set({ groups: result.groups, scanned: result.scanned, selected: new Set() });
      if (result.groups.length) notify.success(t("duplicates.toast.found", { count: result.groups.length }));
      else notify.info(t("duplicates.toast.none"));
    },
    onError: (error) => notify.error(t("duplicates.toast.error"), { body: error }),
  });

  const groups = form.groups ?? [];
  const totals = useMemo(() => {
    const files = groups.reduce((n, g) => n + g.length, 0);
    const wasted = groups.reduce((n, g) => {
      const keep = keeper(g);
      return n + g.filter((i) => i !== keep).reduce((s, i) => s + i.size, 0);
    }, 0);
    const selectedBytes = groups.flat().filter((i) => form.selected.has(i.path)).reduce((s, i) => s + i.size, 0);
    return { files, wasted, selectedBytes };
  }, [groups, form.selected]);

  const toggle = (path: string) => {
    const selected = new Set(form.selected);
    if (selected.has(path)) selected.delete(path);
    else selected.add(path);
    form.set({ selected });
  };

  const autoSelect = () => {
    const selected = new Set<string>();
    groups.forEach((g) => {
      const keep = keeper(g);
      g.forEach((i) => i !== keep && selected.add(i.path));
    });
    form.set({ selected });
  };

  const removeFromResults = (paths: Set<string>) => {
    const next = groups.map((g) => g.filter((i) => !paths.has(i.path))).filter((g) => g.length > 1);
    const selected = new Set([...form.selected].filter((p) => !paths.has(p)));
    form.set({ groups: next, selected });
  };

  const trash = async (paths: string[]) => {
    if (!paths.length) return;
    const ok = await confirm({
      title: t("duplicates.confirmTitle", { count: paths.length }),
      body: t("duplicates.confirmBody"),
      confirmLabel: t("duplicates.moveToTrash"),
      danger: true,
    });
    if (!ok) return;
    const removed = new Set<string>();
    const failures: string[] = [];
    for (const path of paths) {
      try {
        await api.system.trash(path);
        removed.add(path);
      } catch (err) {
        failures.push(`${path}: ${String(err)}`);
      }
    }
    removeFromResults(removed);
    if (removed.size) notify.success(t("duplicates.toast.trashed", { count: removed.size }));
    if (failures.length) notify.error(t("duplicates.toast.trashError", { count: failures.length }), { body: failures.slice(0, 3).join("\n") });
  };

  const exportCsv = async () => {
    const out = await api.dialogs.saveFile(t("duplicates.csvName"), [dialogFilter(t, "csv")]);
    if (!out) return;
    try {
      const path = await api.duplicates.exportCsv(groups, out.toLowerCase().endsWith(".csv") ? out : `${out}.csv`);
      notify.success(t("duplicates.toast.exported"), { action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(path).catch(() => undefined) } });
    } catch (err) {
      notify.error(String(err));
    }
  };

  const start = () =>
    runner.start(() => api.duplicates.scan(form.folder, form.mode, form.threshold)).catch((err) => notify.error(t("duplicates.toast.error"), { body: String(err) }));

  return (
    <Page title={t("tools.duplicates.name")} description={t("tools.duplicates.description")} icon={tool.icon} accent={tool.accent}>
      <Panel
        title={t("duplicates.setup")}
        actions={
          <TabList size="small" selectedValue={form.mode} onTabSelect={(_, d) => form.set({ mode: d.value as Mode, groups: null, selected: new Set() })}>
            <Tab value="image" icon={<Image24Regular />}>
              {t("duplicates.images")}
            </Tab>
            <Tab value="video" icon={<Video24Regular />}>
              {t("duplicates.videos")}
            </Tab>
          </TabList>
        }
      >
        <div className={styles.setup}>
          <Field label={t("duplicates.folder")} hint={t("duplicates.folderHint")}>
            <PathPicker value={form.folder} onChange={(folder) => form.set({ folder })} />
          </Field>
          <SliderField
            label={t("duplicates.sensitivity")}
            hint={t("duplicates.sensitivityHint")}
            value={form.threshold}
            min={2}
            max={24}
            step={2}
            onChange={(threshold) => form.set({ threshold })}
          />
        </div>
      </Panel>

      {form.groups && (
        <Panel
          title={t("duplicates.results")}
          actions={
            groups.length > 0 && (
              <>
                <Button appearance="subtle" icon={<SelectAllOn16Regular />} onClick={autoSelect}>
                  {t("duplicates.autoSelect")}
                </Button>
                <Button appearance="subtle" icon={<ArrowDownload16Regular />} onClick={exportCsv}>
                  {t("duplicates.exportCsv")}
                </Button>
              </>
            )
          }
        >
          {groups.length === 0 ? (
            <EmptyState icon={FolderSearch24Regular} title={t("duplicates.noneTitle")}>
              {t("duplicates.noneBody", { count: form.scanned })}
            </EmptyState>
          ) : (
            <>
              <div className={styles.stats}>
                <Badge appearance="tint" size="large">{t("duplicates.statGroups", { count: groups.length })}</Badge>
                <Badge appearance="tint" size="large">{t("duplicates.statFiles", { count: totals.files })}</Badge>
                <Badge appearance="tint" size="large" color="warning">
                  {t("duplicates.statWasted", { size: formatBytes(totals.wasted) })}
                </Badge>
                <Caption1 className={styles.muted}>{t("duplicates.scannedOf", { count: form.scanned })}</Caption1>
              </div>
              <div className={styles.groups}>
                {groups.map((group, gi) => {
                  const keep = keeper(group);
                  return (
                    <div key={group[0].path} className={styles.group}>
                      <div className={styles.groupHead}>
                        <Text weight="semibold" className={styles.groupTitle}>
                          {t("duplicates.groupTitle", { index: gi + 1, count: group.length })}
                        </Text>
                        <Caption1 className={styles.muted}>{formatBytes(group.reduce((s, i) => s + i.size, 0))}</Caption1>
                      </div>
                      <div className={styles.items}>
                        {group.map((item) => (
                          <ItemCard
                            key={item.path}
                            item={item}
                            isKeeper={item === keep}
                            selected={form.selected.has(item.path)}
                            onToggle={() => toggle(item.path)}
                            onTrash={() => trash([item.path])}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      )}

      {runner.job && runner.job.logs.length > 0 && <LogPanel logs={runner.job.logs} title={t("duplicates.logTitle")} />}

      <ActionBar
        job={runner.running ? runner.job : undefined}
        idleText={
          form.selected.size
            ? t("duplicates.idle.selected", { count: form.selected.size, size: formatBytes(totals.selectedBytes) })
            : form.folder
              ? t("duplicates.idle.ready")
              : t("duplicates.idle.pickFolder")
        }
        onCancel={runner.cancel}
      >
        {form.selected.size > 0 && (
          <Tooltip content={t("duplicates.trashHint")} relationship="description">
            <Button icon={<Delete16Regular />} onClick={() => trash([...form.selected])}>
              {t("duplicates.trashSelected", { count: form.selected.size })}
            </Button>
          </Tooltip>
        )}
        <Button appearance="primary" icon={<Search16Filled />} disabled={!form.folder || runner.running} onClick={start}>
          {t("duplicates.scan")}
        </Button>
      </ActionBar>
    </Page>
  );
}

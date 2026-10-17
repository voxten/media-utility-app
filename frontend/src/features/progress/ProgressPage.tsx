import { useEffect, useRef, useState } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Button,
  Caption1,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Slider,
  SpinButton,
  Switch,
  Tab,
  TabList,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  Add16Regular,
  ArrowCounterclockwise16Regular,
  Delete16Regular,
  Image16Regular,
  ReOrderDotsVertical16Regular,
  Save16Filled,
  WeatherMoon16Regular,
  WeatherSunny16Regular,
} from "@fluentui/react-icons";
import { toPng } from "html-to-image";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { dialogFilter } from "../../lib/fileTypes";
import { fileName } from "../../lib/format";
import { ProgressCard, type CardOptions, type ProgressRow } from "./ProgressCard";

// Gradients from the original style.css plus a few extras.
const PRESETS: { from: string; to: string }[] = [
  { from: "#7d2cff", to: "#d33bff" },
  { from: "#3b82f6", to: "#06b6d4" },
  { from: "#00a6ff", to: "#00ffd9" },
  { from: "#ff6b6b", to: "#ff4d4d" },
  { from: "#22c55e", to: "#16a34a" },
  { from: "#f59e0b", to: "#f97316" },
  { from: "#ec4899", to: "#f43f5e" },
  { from: "#64748b", to: "#94a3b8" },
];

let idSeq = 0;
const row = (name: string, value: number, preset: number): ProgressRow => ({ id: `r${++idSeq}`, name, value, ...PRESETS[preset] });
const DEFAULT_ROWS = () => [
  row("Planning", 100, 5),
  row("Writing", 95, 0),
  row("Art", 90, 1),
  row("Posing", 100, 2),
  row("Code", 60, 3),
  row("Audio", 5, 4),
];

interface ProgressState {
  rows: ProgressRow[];
  options: CardOptions;
  bannerPath: string;
  set: (patch: Partial<Omit<ProgressState, "set">>) => void;
}

const useForm = create<ProgressState>((set) => ({
  rows: DEFAULT_ROWS(),
  options: { title: "", banner: null, width: 900, barHeight: 52, rounded: false, theme: "dark", showPercent: true },
  bannerPath: "",
  set: (patch) => set(patch),
}));

const useStyles = makeStyles({
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
    gap: "16px",
    alignItems: "start",
    "@media (max-width: 1100px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  rows: { display: "flex", flexDirection: "column", gap: "6px" },
  row: {
    display: "grid",
    gridTemplateColumns: "20px 28px minmax(60px, 1.2fr) minmax(50px, 1fr) 72px 28px",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  slider: { minWidth: "0 !important", width: "100%" },
  handle: { cursor: "grab", color: tokens.colorNeutralForeground3, display: "grid", placeItems: "center", touchAction: "none" },
  swatch: {
    width: "26px",
    height: "26px",
    minWidth: "26px",
    padding: "0",
    borderRadius: tokens.borderRadiusMedium,
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    cursor: "pointer",
  },
  palette: { display: "grid", gridTemplateColumns: "repeat(4, 32px)", gap: "8px", marginBottom: "12px" },
  paletteItem: { width: "32px", height: "32px", borderRadius: tokens.borderRadiusMedium, border: "none", cursor: "pointer", boxShadow: tokens.shadow4 },
  custom: { display: "flex", gap: "8px", alignItems: "center" },
  colorInput: { width: "40px", height: "28px", border: "none", padding: "0", background: "none", cursor: "pointer" },
  spin: { minWidth: "0", width: "100%" },
  nameInput: { minWidth: "0", width: "100%" },
  options: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px 16px",
    "@media (max-width: 550px)": { gridTemplateColumns: "1fr" },
  },
  bannerRow: { display: "flex", gap: "8px", alignItems: "center" },
  bannerName: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: tokens.colorNeutralForeground3 },
  previewPanel: { position: "sticky", top: "0" },
  previewBox: {
    borderRadius: tokens.borderRadiusLarge,
    padding: "20px",
    backgroundColor: "#151515",
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
  },
  previewLight: { backgroundColor: "#e9e9ee" },
  muted: { color: tokens.colorNeutralForeground3 },
  stack: { display: "flex", flexDirection: "column", gap: "16px" },
});

function ColorButton({ row: r, onChange }: { row: ProgressRow; onChange: (c: { from: string; to: string }) => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Popover withArrow trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={t("progress.color")} relationship="label">
          <button className={styles.swatch} style={{ background: `linear-gradient(135deg, ${r.from}, ${r.to})` }} />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <div className={styles.palette}>
          {PRESETS.map((p) => (
            <button key={p.from} className={styles.paletteItem} style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }} onClick={() => onChange(p)} aria-label={p.from} />
          ))}
        </div>
        <div className={styles.custom}>
          <Caption1>{t("progress.custom")}</Caption1>
          <input type="color" className={styles.colorInput} value={r.from} onChange={(e) => onChange({ from: e.target.value, to: r.to })} aria-label={t("progress.colorFrom")} />
          <span>→</span>
          <input type="color" className={styles.colorInput} value={r.to} onChange={(e) => onChange({ from: r.from, to: e.target.value })} aria-label={t("progress.colorTo")} />
        </div>
      </PopoverSurface>
    </Popover>
  );
}

function SortableRow({ row: r, onChange, onRemove }: { row: ProgressRow; onChange: (patch: Partial<ProgressRow>) => void; onRemove: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: r.id });
  return (
    <div ref={setNodeRef} className={styles.row} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <span className={styles.handle} {...attributes} {...listeners} aria-label={t("progress.reorder")}>
        <ReOrderDotsVertical16Regular />
      </span>
      <ColorButton row={r} onChange={onChange} />
      <Input className={styles.nameInput} value={r.name} onChange={(_, d) => onChange({ name: d.value })} aria-label={t("progress.name")} />
      <Slider
        className={styles.slider}
        min={0}
        max={100}
        value={r.value}
        onChange={(_, d) => onChange({ value: d.value })}
        aria-label={t("progress.value")}
      />
      <SpinButton
        className={styles.spin}
        min={0}
        max={100}
        value={r.value}
        displayValue={`${r.value}%`}
        onChange={(_, d) => {
          const v = d.value ?? parseInt(String(d.displayValue ?? "").replace("%", ""), 10);
          if (Number.isFinite(v)) onChange({ value: Math.max(0, Math.min(100, Number(v))) });
        }}
        aria-label={t("progress.value")}
      />
      <Tooltip content={t("common.remove")} relationship="label">
        <Button appearance="subtle" size="small" icon={<Delete16Regular />} onClick={onRemove} />
      </Tooltip>
    </div>
  );
}

export default function ProgressPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("progress")!;
  const form = useForm();
  const cardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [cardHeight, setCardHeight] = useState(0);
  const [exporting, setExporting] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Scale the live preview down to the panel width.
  useEffect(() => {
    const box = previewRef.current;
    if (!box) return;
    const update = () => setScale(Math.min(1, (box.clientWidth - 40) / form.options.width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [form.options.width]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setCardHeight(card.offsetHeight));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const setOption = <K extends keyof CardOptions>(key: K, value: CardOptions[K]) => form.set({ options: { ...form.options, [key]: value } });
  const updateRow = (id: string, patch: Partial<ProgressRow>) => form.set({ rows: form.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = form.rows.findIndex((r) => r.id === active.id);
    const to = form.rows.findIndex((r) => r.id === over.id);
    form.set({ rows: arrayMove(form.rows, from, to) });
  };

  const pickBanner = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "images", [".png", ".jpg", ".jpeg", ".webp"])], false);
    if (!path) return;
    try {
      form.set({ bannerPath: path, options: { ...form.options, banner: await api.progress.loadBanner(path) } });
    } catch (err) {
      notify.error(t("progress.toast.bannerError"), { body: String(err) });
    }
  };

  const exportPng = async () => {
    if (!cardRef.current) return;
    const out = await api.dialogs.saveFile(t("progress.defaultName"), ["PNG (*.png)"]);
    if (!out) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const result = await api.progress.save(dataUrl, out);
      notify.success(t("progress.toast.saved"), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      });
    } catch (err) {
      notify.error(t("progress.toast.error"), { body: String(err) });
    } finally {
      setExporting(false);
    }
  };

  const average = form.rows.length ? Math.round(form.rows.reduce((s, r) => s + r.value, 0) / form.rows.length) : 0;

  return (
    <Page title={t("tools.progress.name")} description={t("tools.progress.description")} icon={tool.icon} accent={tool.accent}>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <Panel
            title={t("progress.bars")}
            actions={
              <>
                <Tooltip content={t("progress.reset")} relationship="label">
                  <Button appearance="subtle" icon={<ArrowCounterclockwise16Regular />} onClick={() => form.set({ rows: DEFAULT_ROWS() })} />
                </Tooltip>
                <Button appearance="subtle" icon={<Add16Regular />} onClick={() => form.set({ rows: [...form.rows, row(t("progress.newBar"), 50, form.rows.length % PRESETS.length)] })}>
                  {t("common.add")}
                </Button>
              </>
            }
          >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={form.rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.rows}>
                  {form.rows.map((r) => (
                    <SortableRow key={r.id} row={r} onChange={(patch) => updateRow(r.id, patch)} onRemove={() => form.set({ rows: form.rows.filter((x) => x.id !== r.id) })} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {form.rows.length === 0 && <Caption1 className={styles.muted}>{t("progress.noBars")}</Caption1>}
          </Panel>

          <Panel title={t("progress.appearance")}>
            <Field label={t("progress.title")}>
              <Input value={form.options.title} placeholder={t("progress.titlePlaceholder")} onChange={(_, d) => setOption("title", d.value)} />
            </Field>
            <Field label={t("progress.banner")}>
              <div className={styles.bannerRow}>
                <Caption1 className={styles.bannerName}>{form.bannerPath ? fileName(form.bannerPath) : t("progress.noBanner")}</Caption1>
                {form.options.banner && (
                  <Button appearance="subtle" icon={<Delete16Regular />} onClick={() => form.set({ bannerPath: "", options: { ...form.options, banner: null } })} aria-label={t("common.remove")} />
                )}
                <Button icon={<Image16Regular />} onClick={pickBanner}>
                  {t("common.browse")}
                </Button>
              </div>
            </Field>
            <div className={styles.options}>
              <SliderField label={t("progress.width")} value={form.options.width} min={500} max={1400} step={50} format={(v) => `${v}px`} onChange={(v) => setOption("width", v)} />
              <SliderField label={t("progress.barHeight")} value={form.options.barHeight} min={32} max={80} step={4} format={(v) => `${v}px`} onChange={(v) => setOption("barHeight", v)} />
              <Field label={t("progress.background")}>
                <TabList size="small" selectedValue={form.options.theme} onTabSelect={(_, d) => setOption("theme", d.value as "dark" | "light")}>
                  <Tab value="dark" icon={<WeatherMoon16Regular />}>
                    {t("settings.themes.dark")}
                  </Tab>
                  <Tab value="light" icon={<WeatherSunny16Regular />}>
                    {t("settings.themes.light")}
                  </Tab>
                </TabList>
              </Field>
              <div>
                <Switch checked={form.options.rounded} label={t("progress.rounded")} onChange={(_, d) => setOption("rounded", d.checked)} />
                <Switch checked={form.options.showPercent} label={t("progress.showPercent")} onChange={(_, d) => setOption("showPercent", d.checked)} />
              </div>
            </div>
          </Panel>
        </div>

        <Panel title={t("progress.preview")} className={styles.previewPanel}>
          <div ref={previewRef} className={mergeClasses(styles.previewBox, form.options.theme === "light" && styles.previewLight)}>
            <div style={{ width: form.options.width * scale, height: cardHeight * scale }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: form.options.width }}>
                <ProgressCard ref={cardRef} rows={form.rows} options={form.options} />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <ActionBar idleText={t("progress.idle", { count: form.rows.length, average })}>
        <Button appearance="primary" icon={<Save16Filled />} disabled={!form.rows.length || exporting} onClick={exportPng}>
          {exporting ? t("progress.exporting") : t("progress.export")}
        </Button>
      </ActionBar>
    </Page>
  );
}

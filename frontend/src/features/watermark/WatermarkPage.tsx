import { useEffect, useRef, useState } from "react";
import {
  Button,
  Caption1,
  Divider,
  Dropdown,
  Input,
  makeStyles,
  Option,
  ProgressBar,
  shorthands,
  Slider,
  Text,
  ToggleButton,
  Toolbar,
  ToolbarButton,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowDownload16Regular,
  ArrowRedo20Regular,
  ArrowUndo20Regular,
  Bot24Regular,
  Delete20Regular,
  Dismiss16Regular,
  Edit20Regular,
  Eraser20Regular,
  FolderOpen16Regular,
  Image24Regular,
  ImageEdit20Regular,
  Save16Regular,
  Sparkle16Filled,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { ImageComparison } from "../../components/ImageComparison";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { api } from "../../lib/bridge";
import { dirName, fileName, joinPath } from "../../lib/format";
import { useJob } from "../../stores/jobs";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";
import { MaskCanvas, type MaskCanvasHandle } from "./MaskCanvas";

type Method = "telea" | "ns" | "lama";
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];

interface LoadedImage {
  path: string;
  width: number;
  height: number;
  dataUrl: string;
}

interface InpaintResult {
  resultPath: string;
  dataUrl: string;
  notice: string | null;
  width?: number;
  height?: number;
}

interface WatermarkState {
  image: LoadedImage | null;
  /** Original file the editing session started from (for default save names). */
  sourcePath: string;
  result: InpaintResult | null;
  method: Method;
  brush: number;
  tool: "brush" | "eraser";
  set: (patch: Partial<Omit<WatermarkState, "set">>) => void;
}

const useForm = create<WatermarkState>((set) => ({
  image: null,
  sourcePath: "",
  result: null,
  method: "telea",
  brush: 28,
  tool: "brush",
  set: (patch) => set(patch),
}));

const useStyles = makeStyles({
  toolbar: { flexWrap: "wrap", gap: "4px", padding: "0" },
  brush: { display: "flex", alignItems: "center", gap: "8px", minWidth: "220px", paddingInline: "8px" },
  brushSlider: { flexGrow: 1 },
  brushValue: { minWidth: "44px", fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground3 },
  method: { minWidth: "200px" },
  stage: {
    height: "min(62vh, 640px)",
    minHeight: "320px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground3,
    backgroundImage: `linear-gradient(45deg, ${tokens.colorNeutralBackground4} 25%, transparent 25%), linear-gradient(-45deg, ${tokens.colorNeutralBackground4} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${tokens.colorNeutralBackground4} 75%), linear-gradient(-45deg, transparent 75%, ${tokens.colorNeutralBackground4} 75%)`,
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: "12px",
    boxSizing: "border-box",
  },
  fileRow: { display: "flex", alignItems: "center", gap: "8px", color: tokens.colorNeutralForeground3 },
  grow: { flexGrow: 1 },
  lamaBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    flexWrap: "wrap",
    marginTop: "8px",
    marginBottom: "12px",
  },
  lamaBannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: "1 1 280px",
  },
  lamaIcon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    fontSize: "24px",
  },
  lamaTexts: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  lamaBannerRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
  },
  lamaProgressBox: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "220px",
  },
  lamaProgressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  saveSection: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    alignItems: "flex-end",
    marginTop: "8px",
  },
  saveColDir: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: "1 1 280px",
    minWidth: 0,
  },
  saveColName: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "240px",
  },
});

function LamaBanner({ onInstalled }: { onInstalled: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  useEffect(() => {
    if (!job) return;
    if (job.status === "done") {
      notify.success(t("watermark.lamaPromo.ready"));
      onInstalled();
      setJobId(null);
    } else if (job.status === "error") {
      notify.error(t("settings.deps.failed"), { body: job.error ?? undefined });
    }
  }, [job?.status, job?.error, notify, onInstalled, t]);

  const handleInstall = async () => {
    try {
      const id = await api.system.installDependency("lama");
      setJobId(id);
    } catch (err) {
      notify.error(t("settings.deps.failed"), { body: String(err) });
    }
  };

  const handleCancel = async () => {
    if (jobId) await api.jobs.cancel(jobId);
  };

  const isRunning = job?.status === "running";

  return (
    <div className={styles.lamaBanner}>
      <div className={styles.lamaBannerLeft}>
        <Bot24Regular className={styles.lamaIcon} />
        <div className={styles.lamaTexts}>
          <Text weight="semibold">{t("watermark.lamaPromo.title")}</Text>
          <Caption1>{t("watermark.lamaPromo.desc")}</Caption1>
        </div>
      </div>
      <div className={styles.lamaBannerRight}>
        {isRunning ? (
          <div className={styles.lamaProgressBox}>
            <div className={styles.lamaProgressHeader}>
              <Caption1>{job.message ? t(job.message, job.params) : t("watermark.lamaPromo.installing")}</Caption1>
              <Button appearance="subtle" size="small" icon={<Dismiss16Regular />} onClick={handleCancel} title={t("common.cancel")} />
            </div>
            <ProgressBar value={job.percent != null ? job.percent / 100 : undefined} />
          </div>
        ) : (
          <Button appearance="primary" icon={<ArrowDownload16Regular />} onClick={handleInstall}>
            {t("watermark.lamaPromo.installBtn")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function WatermarkPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("watermark")!;
  const form = useForm();
  const canvasRef = useRef<MaskCanvasHandle>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false, hasMask: false });
  const [lama, setLama] = useState(false);
  const defaultDir = useSettings((s) => s.settings?.outputDir);
  const [outDir, setOutDir] = useState<string>("");
  const [outFileName, setOutFileName] = useState<string>("");

  useEffect(() => {
    api.watermark.lamaAvailable().then(setLama).catch(() => setLama(false));
  }, []);

  const runner = useJobRunner<InpaintResult>("watermark", {
    onDone: (result) => {
      form.set({ result });
      if (result.notice) notify.warning(t("watermark.toast.fallback"), { body: t(result.notice), timeout: 10000 });
      else notify.success(t("watermark.toast.done"));
    },
    onError: (error) => notify.error(t("watermark.toast.error"), { body: error }),
  });

  const getDefaultOutFileName = (sourcePath: string) => {
    const base = fileName(sourcePath).replace(/\.[^.]+$/, "");
    const ext = (sourcePath.match(/\.[^.]+$/)?.[0] ?? ".png").toLowerCase();
    return `${base}${t("watermark.suffix")}${ext}`;
  };

  const load = async (path: string, keepSource = false) => {
    try {
      const image = await api.watermark.load(path);
      form.set({ image, result: null, ...(keepSource ? {} : { sourcePath: path }) });
      const currentSrc = keepSource ? form.sourcePath || path : path;
      const folder = dirName(currentSrc) || defaultDir || "";
      setOutDir(folder);
      setOutFileName(getDefaultOutFileName(currentSrc));
    } catch (err) {
      notify.error(t("watermark.toast.loadError"), { body: String(err) });
    }
  };

  const browse = async () => {
    const [path] = await api.dialogs.openFiles([`${t("converter.images")} (${IMAGE_EXTENSIONS.map((e) => `*${e}`).join(";")})`], false);
    if (path) load(path);
  };

  const run = () => {
    if (!form.image || !canvasRef.current || canvasRef.current.isEmpty()) {
      notify.warning(t("watermark.toast.emptyMask"));
      return;
    }
    const mask = canvasRef.current.toDataUrl();
    runner.start(() => api.watermark.remove(form.image!.path, mask, form.method)).catch((err) => notify.error(String(err)));
  };

  const saveDirect = async () => {
    if (!form.result) return;
    try {
      const name = outFileName.trim() || getDefaultOutFileName(form.sourcePath);
      const folder = outDir.trim() || dirName(form.sourcePath);
      const target = joinPath(folder, name);
      const saved = await api.watermark.save(form.result.resultPath, target);
      notify.success(t("watermark.toast.saved"), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(saved).catch(() => undefined),
        },
      });
    } catch (err) {
      notify.error(t("watermark.toast.saveError"), { body: String(err) });
    }
  };

  const saveAsDialog = async () => {
    if (!form.result) return;
    const defaultName = outFileName.trim() || getDefaultOutFileName(form.sourcePath);
    const target = await api.dialogs.saveFile(
      defaultName,
      ["PNG (*.png)", "JPEG (*.jpg)", "WEBP (*.webp)"],
      outDir.trim() || dirName(form.sourcePath)
    );
    if (!target) return;
    try {
      const ext = (form.sourcePath.match(/\.[^.]+$/)?.[0] ?? ".png").toLowerCase();
      const finalTarget = /\.[a-z0-9]+$/i.test(target) ? target : joinPath(dirName(target), `${fileName(target)}${ext}`);
      const saved = await api.watermark.save(form.result.resultPath, finalTarget);
      notify.success(t("watermark.toast.saved"), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(saved).catch(() => undefined),
        },
      });
    } catch (err) {
      notify.error(t("watermark.toast.saveError"), { body: String(err) });
    }
  };

  // Keyboard shortcuts while editing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!form.image || form.result || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") (e.shiftKey ? canvasRef.current?.redo() : canvasRef.current?.undo());
      else if (e.ctrlKey && e.key.toLowerCase() === "y") canvasRef.current?.redo();
      else if (e.key === "b") form.set({ tool: "brush" });
      else if (e.key === "e") form.set({ tool: "eraser" });
      else if (e.key === "[") form.set({ brush: Math.max(4, form.brush - 4) });
      else if (e.key === "]") form.set({ brush: Math.min(160, form.brush + 4) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]);

  if (!form.image) {
    return (
      <Page title={t("tools.watermark.name")} description={t("tools.watermark.description")} icon={tool.icon} accent={tool.accent}>
        <DropZone icon={Image24Regular} title={t("watermark.dropTitle")} hint={t("watermark.dropHint")} accept={IMAGE_EXTENSIONS} onFiles={(paths) => load(paths[0])} onBrowse={browse} />
        <Panel title={t("watermark.howTitle")}>
          <Text>{t("watermark.howBody")}</Text>
          {!lama && <LamaBanner onInstalled={() => { setLama(true); form.set({ method: "lama" }); }} />}
        </Panel>
      </Page>
    );
  }

  const methods: { id: Method; label: string; disabled?: boolean }[] = [
    { id: "telea", label: t("watermark.methods.telea") },
    { id: "ns", label: t("watermark.methods.ns") },
    { id: "lama", label: lama ? t("watermark.methods.lama") : t("watermark.methods.lamaMissing"), disabled: !lama },
  ];

  return (
    <Page title={t("tools.watermark.name")} description={t("tools.watermark.description")} icon={tool.icon} accent={tool.accent}>
      <Panel
        title={
          <span className={styles.fileRow}>
            <Image24Regular />
            <Text weight="semibold">{fileName(form.sourcePath)}</Text>
            <Caption1>
              {form.image.width}×{form.image.height}
            </Caption1>
          </span>
        }
        actions={
          <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
            {t("watermark.changeImage")}
          </Button>
        }
      >
        {!lama && <LamaBanner onInstalled={() => { setLama(true); form.set({ method: "lama" }); }} />}
        {!form.result && (
          <Toolbar className={styles.toolbar} aria-label={t("watermark.tools")}>
            <Tooltip content={`${t("watermark.brush")} (B)`} relationship="label">
              <ToggleButton appearance="subtle" checked={form.tool === "brush"} icon={<Edit20Regular />} onClick={() => form.set({ tool: "brush" })} />
            </Tooltip>
            <Tooltip content={`${t("watermark.eraser")} (E)`} relationship="label">
              <ToggleButton appearance="subtle" checked={form.tool === "eraser"} icon={<Eraser20Regular />} onClick={() => form.set({ tool: "eraser" })} />
            </Tooltip>
            <div className={styles.brush}>
              <Caption1>{t("watermark.size")}</Caption1>
              <Slider className={styles.brushSlider} min={4} max={160} value={form.brush} onChange={(_, d) => form.set({ brush: d.value })} />
              <Caption1 className={styles.brushValue}>{form.brush}px</Caption1>
            </div>
            <Divider vertical />
            <Tooltip content={`${t("watermark.undo")} (Ctrl+Z)`} relationship="label">
              <ToolbarButton icon={<ArrowUndo20Regular />} disabled={!history.canUndo} onClick={() => canvasRef.current?.undo()} />
            </Tooltip>
            <Tooltip content={`${t("watermark.redo")} (Ctrl+Y)`} relationship="label">
              <ToolbarButton icon={<ArrowRedo20Regular />} disabled={!history.canRedo} onClick={() => canvasRef.current?.redo()} />
            </Tooltip>
            <Tooltip content={t("watermark.clearMask")} relationship="label">
              <ToolbarButton icon={<Delete20Regular />} disabled={!history.hasMask} onClick={() => canvasRef.current?.clear()} />
            </Tooltip>
            <span className={styles.grow} />
            <Dropdown
              className={styles.method}
              value={methods.find((m) => m.id === form.method)?.label}
              selectedOptions={[form.method]}
              onOptionSelect={(_, d) => form.set({ method: d.optionValue as Method })}
              aria-label={t("watermark.method")}
            >
              {methods.map((m) => (
                <Option key={m.id} value={m.id} disabled={m.disabled}>
                  {m.label}
                </Option>
              ))}
            </Dropdown>
          </Toolbar>
        )}

        <div className={styles.stage}>
          {form.result && (
            <ImageComparison
              before={form.image.dataUrl}
              after={form.result.dataUrl}
              beforeLabel={t("watermark.before")}
              afterLabel={t("watermark.after")}
              maxHeight="calc(min(62vh, 640px) - 24px)"
              aspectRatio={form.image.width && form.image.height ? form.image.width / form.image.height : undefined}
            />
          )}
          {/* Kept mounted while comparing so the painted mask survives "back to mask". */}
          <div style={{ display: form.result ? "none" : "contents" }}>
            <MaskCanvas
              ref={canvasRef}
              src={form.image.dataUrl}
              width={form.image.width}
              height={form.image.height}
              brush={form.brush}
              tool={form.tool}
              onHistoryChange={setHistory}
            />
          </div>
        </div>

        {/* Output path and filename selector */}
        <div className={styles.saveSection}>
          <div className={styles.saveColDir}>
            <Text size={200} weight="semibold">
              {t("common.outputFolder")}
            </Text>
            <PathPicker value={outDir} onChange={(dir) => setOutDir(dir)} mode="folder" openable />
          </div>
          <div className={styles.saveColName}>
            <Text size={200} weight="semibold">
              {t("common.fileName")}
            </Text>
            <Input
              value={outFileName}
              onChange={(_, d) => setOutFileName(d.value)}
              placeholder="nazwa_pliku.png"
            />
          </div>
        </div>
      </Panel>

      <ActionBar
        job={runner.running ? runner.job : undefined}
        idleText={form.result ? t("watermark.idle.done") : history.hasMask ? t("watermark.idle.ready") : t("watermark.idle.paint")}
        onCancel={runner.cancel}
      >
        {form.result ? (
          <>
            <Button onClick={() => form.set({ result: null })}>{t("watermark.backToMask")}</Button>
            <Button onClick={() => load(form.result!.resultPath, true)}>{t("watermark.continue")}</Button>
            <Button appearance="primary" icon={<Save16Regular />} onClick={saveDirect}>
              {t("common.saveBtn")}
            </Button>
            <Button appearance="subtle" icon={<FolderOpen16Regular />} onClick={saveAsDialog}>
              {t("common.saveAs")}
            </Button>
          </>
        ) : (
          <Button appearance="primary" icon={<Sparkle16Filled />} disabled={!history.hasMask || runner.running} onClick={run}>
            {t("watermark.remove")}
          </Button>
        )}
      </ActionBar>
    </Page>
  );
}

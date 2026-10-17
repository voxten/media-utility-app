import { useEffect, useRef, useState } from "react";
import {
  Button,
  Caption1,
  Divider,
  Dropdown,
  makeStyles,
  Option,
  Slider,
  Text,
  ToggleButton,
  Toolbar,
  ToolbarButton,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRedo20Regular,
  ArrowUndo20Regular,
  Delete20Regular,
  Edit20Regular,
  Eraser20Regular,
  FolderOpen16Regular,
  Image24Regular,
  ImageEdit20Regular,
  Save16Regular,
  ArrowRight16Regular,
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
import { ModelBanner } from "../../components/ModelBanner";
import { SaveOutputFields, useSaveOutput } from "../../components/SaveOutput";
import { api } from "../../lib/bridge";
import { dialogFilter, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import {  fileName } from "../../lib/format";
import { } from "../../stores/jobs";
import { useJobRunner } from "../../lib/useJobRunner";
import { } from "../../stores/settings";
import { MaskCanvas, type MaskCanvasHandle } from "./MaskCanvas";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";

type Method = "telea" | "ns" | "lama";

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
});

function LamaBanner({ onInstalled }: { onInstalled: () => void }) {
  const { t } = useTranslation();
  return (
    <ModelBanner
      depId="lama"
      title={t("watermark.lamaPromo.title")}
      description={t("watermark.lamaPromo.desc")}
      installLabel={t("watermark.lamaPromo.installBtn")}
      readyMessage={t("watermark.lamaPromo.ready")}
      onInstalled={onInstalled}
    />
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
  const output = useSaveOutput(api.watermark.save);

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
      output.reset(currentSrc, getDefaultOutFileName(currentSrc));
    } catch (err) {
      notify.error(t("watermark.toast.loadError"), { body: String(err) });
    }
  };

  useIncomingTransfer("watermark", (files) => {
    if (files[0]) load(files[0]);
  });

  const browse = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "images")], false);
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
        {!lama && <LamaBanner onInstalled={() => { setLama(true); form.set({ method: "lama" }); }} />}
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
          <>
            <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
              {t("watermark.changeImage")}
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([form.result?.resultPath ?? form.sourcePath], "watermark")}
            >
              {t("transfer.sendTo")}
            </Button>
          </>
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

        <SaveOutputFields output={output} />
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
            <Button appearance="primary" icon={<Save16Regular />} disabled={!output.canSave} onClick={() => output.saveHere(form.result!.resultPath)}>
              {t("common.saveBtn")}
            </Button>
            <Button
              appearance="subtle"
              icon={<FolderOpen16Regular />}
              onClick={() => output.saveAs(form.result!.resultPath, [dialogFilter(t, "images", [".png", ".jpg", ".webp"])])}
            >
              {t("common.saveAs")}
            </Button>
          </>
        ) : (
          <Button appearance="primary" icon={<Eraser20Regular />} disabled={!history.hasMask || runner.running} onClick={run}>
            {t("watermark.remove")}
          </Button>
        )}
      </ActionBar>
    </Page>
  );
}

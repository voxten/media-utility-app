import { useEffect, useRef, useState } from "react";
import {
  Button,
  Caption1,
  Divider,
  makeStyles,
  Slider,
  ToggleButton,
  Toolbar,
  ToolbarButton,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import { ArrowRedo20Regular, ArrowUndo20Regular, Delete20Regular, Edit20Regular, Eraser20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { ModelBanner } from "../../components/ModelBanner";
import { Select } from "../../components/Select";
import { useNotify } from "../../components/notify";
import { useSaveOutput } from "../../components/SaveOutput";
import { SingleImageTool } from "../../components/SingleImageTool";
import { api } from "../../lib/bridge";
import { formatList, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName } from "../../lib/format";
import { hasCommandModifier, isTypingTarget } from "../../lib/keyboard";
import { useJobRunner } from "../../lib/useJobRunner";
import { MaskCanvas, type MaskCanvasHandle } from "./MaskCanvas";
import { errorMessage } from "../../lib/errors";

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
  const form = useForm();
  const canvasRef = useRef<MaskCanvasHandle>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false, hasMask: false });
  const [lama, setLama] = useState(false);
  const output = useSaveOutput("watermark", api.watermark.save);

  useEffect(() => {
    api.watermark.lamaAvailable().then(setLama).catch(() => setLama(false));
  }, []);

  const runner = useJobRunner<InpaintResult>("watermark", {
    onDone: (result) => {
      form.set({ result });
      if (result.notice) notify.warning(t("watermark.toast.fallback"), { body: t(result.notice), timeout: 10000 });
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
      output.reset(getDefaultOutFileName(currentSrc));
    } catch (err) {
      notify.error(t("watermark.toast.loadError"), { body: errorMessage(t, err) });
    }
  };

  const run = () => {
    if (!form.image || !canvasRef.current || canvasRef.current.isEmpty()) {
      notify.warning(t("watermark.toast.emptyMask"));
      return;
    }
    const mask = canvasRef.current.toDataUrl();
    runner.start(() => api.watermark.remove(form.image!.path, mask, form.method)).catch((err) => notify.error(errorMessage(t, err)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!form.image || form.result || isTypingTarget(e.target)) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        if (e.shiftKey) canvasRef.current?.redo();
        else canvasRef.current?.undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === "y") canvasRef.current?.redo();
      else if (hasCommandModifier(e)) return;
      else if (e.key === "b") form.set({ tool: "brush" });
      else if (e.key === "e") form.set({ tool: "eraser" });
      else if (e.key === "[") form.set({ brush: Math.max(4, form.brush - 4) });
      else if (e.key === "]") form.set({ brush: Math.min(160, form.brush + 4) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]);

  const methods: { id: Method; label: string; disabled?: boolean }[] = [
    { id: "telea", label: t("watermark.methods.telea") },
    { id: "ns", label: t("watermark.methods.ns") },
    { id: "lama", label: lama ? t("watermark.methods.lama") : t("watermark.methods.lamaMissing"), disabled: !lama },
  ];

  const lamaBanner = !lama && (
    <LamaBanner
      onInstalled={() => {
        setLama(true);
        form.set({ method: "lama" });
      }}
    />
  );

  const toolbar = !form.result && (
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
        <Select
          className={styles.method}
          options={methods.map((m) => ({ value: m.id, label: m.label, disabled: m.disabled }))}
          value={form.method}
          onChange={(method) => form.set({ method })}
          aria-label={t("watermark.method")}
        />
      </Toolbar>
  );

  return (
    <SingleImageTool
      toolId="watermark"
      image={form.image}
      sourcePath={form.sourcePath}
      result={form.result}
      onLoad={load}
      dropTitle={t("watermark.dropTitle")}
      dropHint={t("watermark.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
      banner={lamaBanner}
      toolbar={toolbar}
      editor={
        form.image && (
          <MaskCanvas
            ref={canvasRef}
            src={form.image.dataUrl}
            width={form.image.width}
            height={form.image.height}
            brush={form.brush}
            tool={form.tool}
            onHistoryChange={setHistory}
          />
        )
      }
      output={output}
      saveExtensions={[".png", ".jpg", ".webp"]}
      job={runner.job}
      idleText={form.result ? t("watermark.idle.done") : history.hasMask ? t("watermark.idle.ready") : t("watermark.idle.paint")}
      onCancel={runner.cancel}
      onRun={history.hasMask && !runner.running && run}
      runAction={
        <Button appearance="primary" icon={<Eraser20Regular />} disabled={!history.hasMask || runner.running} onClick={run}>
          {t("watermark.remove")}
        </Button>
      }
      resultActions={<Button onClick={() => form.set({ result: null })}>{t("watermark.backToMask")}</Button>}
      onContinue={() => form.result && load(form.result.resultPath, true)}
    />
  );
}

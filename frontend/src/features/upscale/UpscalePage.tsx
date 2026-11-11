import { useEffect, useState } from "react";
import { Button, Divider, makeStyles, Switch, Text, Toolbar, Tooltip } from "@fluentui/react-components";
import { ArrowMaximize16Filled } from "@fluentui/react-icons";
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
import type { UpscaleOptions, UpscalePreview, UpscaleResult } from "../../lib/types";
import { useJobRunner } from "../../lib/useJobRunner";
import { errorMessage } from "../../lib/errors";

type ModelType = "general" | "anime";
type AlphaMode = "smooth" | "ai";

interface UpscaleFormState {
  image: UpscalePreview | null;
  sourcePath: string;
  result: UpscaleResult | null;
  model: ModelType;
  scale: 2 | 4;
  alphaMode: AlphaMode;
  antiHalo: boolean;
  set: (patch: Partial<Omit<UpscaleFormState, "set">>) => void;
}

const useForm = create<UpscaleFormState>((set) => ({
  image: null,
  sourcePath: "",
  result: null,
  model: "general",
  scale: 4,
  alphaMode: "smooth",
  antiHalo: true,
  set: (patch) => set(patch),
}));

const useStyles = makeStyles({
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
    padding: "0",
  },
  optionItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "160px",
  },
  modelDropdown: {
    minWidth: "260px",
  },
  scaleDropdown: {
    minWidth: "130px",
  },
  alphaDropdown: {
    minWidth: "180px",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "16px",
  },
});

const MODELS: Record<ModelType, { depId: string; name: string; size: string }> = {
  general: { depId: "upscale_general", name: "General (x4v3)", size: "~4.8 MB" },
  anime: { depId: "upscale_anime", name: "Anime (x4plus)", size: "~17.9 MB" },
};

function UpscaleModelBanner({ model, onInstalled }: { model: ModelType; onInstalled: () => void }) {
  const { t } = useTranslation();
  const m = MODELS[model];
  return (
    <ModelBanner
      depId={m.depId}
      title={t("upscale.modelPromo.title", { model: m.name })}
      description={t("upscale.modelPromo.desc")}
      installLabel={t("upscale.modelPromo.installBtn", { size: m.size })}
      readyMessage={t("upscale.modelPromo.ready")}
      onInstalled={onInstalled}
    />
  );
}

export default function UpscalePage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const form = useForm();
  const output = useSaveOutput("upscale", api.upscale.save);

  const [modelsReady, setModelsReady] = useState<{ general: boolean; anime: boolean }>({
    general: false,
    anime: false,
  });

  const checkModels = () => {
    api.upscale
      .modelsStatus()
      .then(setModelsReady)
      .catch(() => setModelsReady({ general: false, anime: false }));
  };

  useEffect(() => {
    checkModels();
  }, []);

  const runner = useJobRunner<UpscaleResult>("upscale", {
    onDone: (result) => form.set({ result }),
    onError: (error) => notify.error(t("upscale.toast.error"), { body: error }),
  });

  const getDefaultOutFileName = (sourcePath: string, scale: number) => {
    const base = fileName(sourcePath).replace(/\.[^.]+$/, "");
    const ext = (sourcePath.match(/\.[^.]+$/)?.[0] ?? ".png").toLowerCase();
    return `${base}${t("upscale.suffix")}_${scale}x${ext}`;
  };

  const load = async (path: string, keepSource = false) => {
    try {
      const image = await api.upscale.load(path);
      form.set({ image, result: null, ...(keepSource ? {} : { sourcePath: path }) });
      const currentSrc = keepSource ? form.sourcePath || path : path;
      output.reset(getDefaultOutFileName(currentSrc, form.scale));
    } catch (err) {
      notify.error(t("upscale.toast.loadError"), { body: errorMessage(t, err) });
    }
  };

  const currentModelReady = modelsReady[form.model];

  const run = () => {
    if (!form.image) return;
    if (!currentModelReady) {
      notify.warning(t("upscale.idle.needModel"));
      return;
    }

    const opts: UpscaleOptions = {
      path: form.image.path,
      model: form.model,
      scale: form.scale,
      alphaMode: form.alphaMode,
      antiHalo: form.antiHalo,
    };

    runner.start(() => api.upscale.start(opts)).catch((err) => notify.error(errorMessage(t, err)));
  };

  const modelOptions = [
    { id: "general" as ModelType, label: t("upscale.models.general"), size: MODELS.general.size },
    { id: "anime" as ModelType, label: t("upscale.models.anime"), size: MODELS.anime.size },
  ];

  const scaleOptions = [
    { id: 4 as const, label: t("upscale.options.scale4x") },
    { id: 2 as const, label: t("upscale.options.scale2x") },
  ];

  const alphaOptions = [
    { id: "smooth" as AlphaMode, label: t("upscale.options.alphaSmooth") },
    { id: "ai" as AlphaMode, label: t("upscale.options.alphaAi") },
  ];

  const toolbar = form.image && !form.result && (
    <Toolbar className={styles.toolbar} aria-label={t("tools.upscale.name")}>
      <div className={styles.optionItem}>
        <Text size={200} weight="semibold">{t("upscale.options.model")}</Text>
        <Select
          className={styles.modelDropdown}
          options={modelOptions.map((m) => ({ value: m.id, label: modelsReady[m.id] ? m.label : `${m.label} (${m.size})` }))}
          value={form.model}
          onChange={(model) => form.set({ model })}
          aria-label={t("upscale.options.model")}
        />
      </div>

      <div className={styles.optionItem}>
        <Text size={200} weight="semibold">{t("upscale.options.scale")}</Text>
        <Select
          className={styles.scaleDropdown}
          options={scaleOptions.map((o) => ({ value: String(o.id), label: o.label }))}
          value={String(form.scale)}
          onChange={(v) => {
            const nextScale = Number(v) as 2 | 4;
            form.set({ scale: nextScale });
            if (form.sourcePath) output.setName(getDefaultOutFileName(form.sourcePath, nextScale));
          }}
          aria-label={t("upscale.options.scale")}
        />
      </div>

      {form.image.hasAlpha && (
        <>
          <Divider vertical />
          <div className={styles.optionItem}>
            <Text size={200} weight="semibold">{t("upscale.options.alphaMode")}</Text>
            <Select
              className={styles.alphaDropdown}
              options={alphaOptions.map((a) => ({ value: a.id, label: a.label }))}
              value={form.alphaMode}
              onChange={(alphaMode) => form.set({ alphaMode })}
              aria-label={t("upscale.options.alphaMode")}
            />
          </div>

          <div className={styles.switchRow}>
            <Switch
              checked={form.antiHalo}
              onChange={(_, data) => form.set({ antiHalo: data.checked })}
              label={
                <Tooltip content={t("upscale.options.antiHaloHint")} relationship="description">
                  <span>{t("upscale.options.antiHalo")}</span>
                </Tooltip>
              }
            />
          </div>
        </>
      )}
    </Toolbar>
  );

  return (
    <SingleImageTool
      toolId="upscale"
      image={form.image}
      sourcePath={form.sourcePath}
      result={form.result}
      onLoad={load}
      dropTitle={t("upscale.dropTitle")}
      dropHint={t("upscale.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
      banner={!currentModelReady && <UpscaleModelBanner model={form.model} onInstalled={checkModels} />}
      emptyBanner={!modelsReady.general && <UpscaleModelBanner model="general" onInstalled={checkModels} />}
      caption={form.image && `${form.image.width}×${form.image.height} → ${form.image.width * form.scale}×${form.image.height * form.scale}`}
      toolbar={toolbar}
      output={output}
      saveExtensions={[".png", ".jpg", ".webp"]}
      job={runner.job}
      idleText={form.result ? t("upscale.idle.done") : currentModelReady ? t("upscale.idle.ready") : t("upscale.idle.needModel")}
      onCancel={runner.cancel}
      onRun={currentModelReady && !runner.running && run}
      runAction={
        <Button appearance="primary" icon={<ArrowMaximize16Filled />} disabled={!currentModelReady || runner.running} onClick={run}>
          {t("upscale.runBtn")}
        </Button>
      }
      resultActions={<Button onClick={() => form.set({ result: null })}>{t("upscale.backToOptions")}</Button>}
      onContinue={() => form.result && load(form.result.resultPath, true)}
    />
  );
}

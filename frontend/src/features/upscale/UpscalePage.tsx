import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Divider,
  Dropdown,
  makeStyles,
  Option,
  Switch,
  Text,
  Toolbar,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  FolderOpen16Regular,
  Image24Regular,
  ImageEdit20Regular,
  Save16Regular,
  Sparkle16Filled,
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
import type { UpscaleOptions, UpscalePreview, UpscaleResult } from "../../lib/types";
import { } from "../../stores/jobs";
import { useJobRunner } from "../../lib/useJobRunner";
import { } from "../../stores/settings";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";

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
  stage: {
    height: "min(64vh, 660px)",
    minHeight: "340px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground3,
    backgroundImage: `linear-gradient(45deg, ${tokens.colorNeutralBackground4} 25%, transparent 25%), linear-gradient(-45deg, ${tokens.colorNeutralBackground4} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${tokens.colorNeutralBackground4} 75%), linear-gradient(-45deg, transparent 75%, ${tokens.colorNeutralBackground4} 75%)`,
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: "16px",
    boxSizing: "border-box",
    position: "relative",
  },
  stagePreview: {
    maxWidth: "100%",
    maxHeight: "calc(min(64vh, 660px) - 32px)",
    objectFit: "contain",
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusMedium,
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: tokens.colorNeutralForeground3,
    flexWrap: "wrap",
  },
  grow: {
    flexGrow: 1,
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
  const tool = toolById("upscale")!;
  const form = useForm();
  const output = useSaveOutput(api.upscale.save);

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
    onDone: (result) => {
      form.set({ result });
      notify.success(t("upscale.toast.done"));
    },
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
      output.reset(currentSrc, getDefaultOutFileName(currentSrc, form.scale));
    } catch (err) {
      notify.error(t("upscale.toast.loadError"), { body: String(err) });
    }
  };

  useIncomingTransfer("upscale", (files) => {
    if (files[0]) load(files[0]);
  });

  const browse = async () => {
    const [path] = await api.dialogs.openFiles(
      [dialogFilter(t, "images")],
      false
    );
    if (path) load(path);
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

    runner.start(() => api.upscale.start(opts)).catch((err) => notify.error(String(err)));
  };

  if (!form.image) {
    return (
      <Page
        title={t("tools.upscale.name")}
        description={t("tools.upscale.description")}
        icon={tool.icon}
        accent={tool.accent}
      >
        <DropZone
          icon={Image24Regular}
          title={t("upscale.dropTitle")}
          hint={t("upscale.dropHint")}
          accept={IMAGE_EXTENSIONS}
          onFiles={(paths) => load(paths[0])}
          onBrowse={browse}
        />
        {!modelsReady.general && <UpscaleModelBanner model="general" onInstalled={checkModels} />}
      </Page>
    );
  }

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

  const targetWidth = form.image.width * form.scale;
  const targetHeight = form.image.height * form.scale;

  return (
    <Page
      title={t("tools.upscale.name")}
      description={t("tools.upscale.description")}
      icon={tool.icon}
      accent={tool.accent}
    >
      <Panel
        title={
          <span className={styles.fileRow}>
            <Image24Regular />
            <Text weight="semibold">{fileName(form.sourcePath)}</Text>
            <Caption1>
              {form.image.width}×{form.image.height} → {targetWidth}×{targetHeight} ({form.scale}×)
            </Caption1>
            {form.image.hasAlpha ? (
              <Badge appearance="filled" color="brand">
                {t("upscale.badges.transparent")}
              </Badge>
            ) : (
              <Badge appearance="tint" color="informative">
                {t("upscale.badges.opaque")}
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
              {t("upscale.changeImage")}
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([form.result?.resultPath ?? form.sourcePath], "upscale")}
            >
              {t("transfer.sendTo")}
            </Button>
          </>
        }
      >
        {!currentModelReady && <UpscaleModelBanner model={form.model} onInstalled={checkModels} />}

        {!form.result && (
          <Toolbar className={styles.toolbar} aria-label={t("tools.upscale.name")}>
            <div className={styles.optionItem}>
              <Text size={200} weight="semibold">{t("upscale.options.model")}</Text>
              <Dropdown
                className={styles.modelDropdown}
                value={modelOptions.find((m) => m.id === form.model)?.label}
                selectedOptions={[form.model]}
                onOptionSelect={(_, d) => form.set({ model: d.optionValue as ModelType })}
                aria-label={t("upscale.options.model")}
              >
                {modelOptions.map((m) => (
                  <Option
                    key={m.id}
                    value={m.id}
                    text={`${m.label} ${!modelsReady[m.id] ? `(${m.size})` : ""}`.trim()}
                  >
                    {m.label} {!modelsReady[m.id] ? `(${m.size})` : ""}
                  </Option>
                ))}
              </Dropdown>
            </div>

            <div className={styles.optionItem}>
              <Text size={200} weight="semibold">{t("upscale.options.scale")}</Text>
              <Dropdown
                className={styles.scaleDropdown}
                value={scaleOptions.find((s) => s.id === form.scale)?.label}
                selectedOptions={[String(form.scale)]}
                onOptionSelect={(_, d) => {
                  const nextScale = Number(d.optionValue) as 2 | 4;
                  form.set({ scale: nextScale });
                  if (form.sourcePath) {
                    output.setName(getDefaultOutFileName(form.sourcePath, nextScale));
                  }
                }}
                aria-label={t("upscale.options.scale")}
              >
                {scaleOptions.map((s) => (
                  <Option key={String(s.id)} value={String(s.id)}>
                    {s.label}
                  </Option>
                ))}
              </Dropdown>
            </div>

            {form.image.hasAlpha && (
              <>
                <Divider vertical />
                <div className={styles.optionItem}>
                  <Text size={200} weight="semibold">{t("upscale.options.alphaMode")}</Text>
                  <Dropdown
                    className={styles.alphaDropdown}
                    value={alphaOptions.find((a) => a.id === form.alphaMode)?.label}
                    selectedOptions={[form.alphaMode]}
                    onOptionSelect={(_, d) => form.set({ alphaMode: d.optionValue as AlphaMode })}
                    aria-label={t("upscale.options.alphaMode")}
                  >
                    {alphaOptions.map((a) => (
                      <Option key={a.id} value={a.id}>
                        {a.label}
                      </Option>
                    ))}
                  </Dropdown>
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
        )}

        <div className={styles.stage}>
          {form.result ? (
            <ImageComparison
              before={form.image.dataUrl}
              after={form.result.dataUrl}
              beforeLabel={`${t("upscale.before")} (${form.image.width}×${form.image.height})`}
              afterLabel={`${t("upscale.after", { scale: form.scale })} (${form.result.width}×${form.result.height})`}
              maxHeight="calc(min(64vh, 660px) - 32px)"
              aspectRatio={form.image.width && form.image.height ? form.image.width / form.image.height : undefined}
            />
          ) : (
            <img
              src={form.image.dataUrl}
              alt={fileName(form.sourcePath)}
              className={styles.stagePreview}
            />
          )}
        </div>

        <SaveOutputFields output={output} />
      </Panel>

      <ActionBar
        job={runner.running ? runner.job : undefined}
        idleText={
          form.result
            ? t("upscale.idle.done")
            : currentModelReady
            ? t("upscale.idle.ready")
            : t("upscale.idle.needModel")
        }
        onCancel={runner.cancel}
      >
        {form.result ? (
          <>
            <Button onClick={() => form.set({ result: null })}>{t("upscale.backToOptions")}</Button>
            <Button onClick={() => load(form.result!.resultPath, true)}>
              {t("upscale.continueWithThis")}
            </Button>
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
          <Button
            appearance="primary"
            icon={<Sparkle16Filled />}
            disabled={!currentModelReady || runner.running}
            onClick={run}
          >
            {t("upscale.runBtn", { scale: form.scale })}
          </Button>
        )}
      </ActionBar>
    </Page>
  );
}

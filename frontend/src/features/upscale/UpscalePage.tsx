import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Divider,
  Dropdown,
  Input,
  makeStyles,
  Option,
  ProgressBar,
  shorthands,
  Switch,
  Text,
  Toolbar,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowDownload16Regular,
  Bot24Regular,
  Dismiss16Regular,
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
import { PathPicker } from "../../components/PathPicker";
import { api } from "../../lib/bridge";
import { dirName, fileName, joinPath } from "../../lib/format";
import type { UpscaleOptions, UpscalePreview, UpscaleResult } from "../../lib/types";
import { useJob } from "../../stores/jobs";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];

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
  modelBanner: {
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
  modelBannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: "1 1 280px",
  },
  modelIcon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    fontSize: "24px",
  },
  modelTexts: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  modelBannerRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
  },
  progressBox: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "220px",
  },
  progressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  transparencyBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
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

function ModelDownloadBanner({
  depId,
  modelName,
  sizeEstimate,
  onInstalled,
}: {
  depId: "upscale_general" | "upscale_anime";
  modelName: string;
  sizeEstimate: string;
  onInstalled: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  useEffect(() => {
    if (!job) return;
    if (job.status === "done") {
      notify.success(t("upscale.modelPromo.ready"));
      onInstalled();
      setJobId(null);
    } else if (job.status === "error") {
      notify.error(t("settings.deps.failed"), { body: job.error ?? undefined });
    }
  }, [job?.status, job?.error, notify, onInstalled, t]);

  const handleInstall = async () => {
    try {
      const id = await api.system.installDependency(depId);
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
    <div className={styles.modelBanner}>
      <div className={styles.modelBannerLeft}>
        <Bot24Regular className={styles.modelIcon} />
        <div className={styles.modelTexts}>
          <Text weight="semibold">
            {t("upscale.modelPromo.title", { model: modelName })}
          </Text>
          <Caption1>{t("upscale.modelPromo.desc")}</Caption1>
        </div>
      </div>
      <div className={styles.modelBannerRight}>
        {isRunning ? (
          <div className={styles.progressBox}>
            <div className={styles.progressHeader}>
              <Caption1>
                {job.message ? t(job.message, job.params) : t("upscale.modelPromo.installing")}
              </Caption1>
              <Button
                appearance="subtle"
                size="small"
                icon={<Dismiss16Regular />}
                onClick={handleCancel}
                title={t("common.cancel")}
              />
            </div>
            <ProgressBar value={job.percent != null ? job.percent / 100 : undefined} />
          </div>
        ) : (
          <Button appearance="primary" icon={<ArrowDownload16Regular />} onClick={handleInstall}>
            {t("upscale.modelPromo.installBtn", { size: sizeEstimate })}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function UpscalePage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("upscale")!;
  const form = useForm();
  const defaultDir = useSettings((s) => s.settings?.outputDir);
  const [outDir, setOutDir] = useState<string>("");
  const [outFileName, setOutFileName] = useState<string>("");

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
      const folder = dirName(currentSrc) || defaultDir || "";
      setOutDir(folder);
      setOutFileName(getDefaultOutFileName(currentSrc, form.scale));
    } catch (err) {
      notify.error(t("upscale.toast.loadError"), { body: String(err) });
    }
  };

  useIncomingTransfer("upscale", (files) => {
    if (files[0]) load(files[0]);
  });

  const browse = async () => {
    const [path] = await api.dialogs.openFiles(
      [`${t("converter.images")} (${IMAGE_EXTENSIONS.map((e) => `*${e}`).join(";")})`],
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

  const saveDirect = async () => {
    if (!form.result) return;
    try {
      const name = outFileName.trim() || getDefaultOutFileName(form.sourcePath, form.scale);
      const folder = outDir.trim() || dirName(form.sourcePath);
      const target = joinPath(folder, name);
      const saved = await api.upscale.save(form.result.resultPath, target);
      notify.success(t("upscale.toast.saved"), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(saved).catch(() => undefined),
        },
      });
    } catch (err) {
      notify.error(t("upscale.toast.saveError"), { body: String(err) });
    }
  };

  const saveAsDialog = async () => {
    if (!form.result) return;
    const defaultName = outFileName.trim() || getDefaultOutFileName(form.sourcePath, form.scale);
    const target = await api.dialogs.saveFile(
      defaultName,
      ["PNG (*.png)", "JPEG (*.jpg)", "WEBP (*.webp)"],
      outDir.trim() || dirName(form.sourcePath)
    );
    if (!target) return;
    try {
      const ext = (form.sourcePath.match(/\.[^.]+$/)?.[0] ?? ".png").toLowerCase();
      const finalTarget = /\.[a-z0-9]+$/i.test(target) ? target : joinPath(dirName(target), `${fileName(target)}${ext}`);
      const saved = await api.upscale.save(form.result.resultPath, finalTarget);
      notify.success(t("upscale.toast.saved"), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(saved).catch(() => undefined),
        },
      });
    } catch (err) {
      notify.error(t("upscale.toast.saveError"), { body: String(err) });
    }
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
        <Panel title={t("upscale.howTitle")}>
          <Text>{t("upscale.howBody")}</Text>
          {!modelsReady.general && (
            <ModelDownloadBanner
              depId="upscale_general"
              modelName="General (x4v3)"
              sizeEstimate="~4.8 MB"
              onInstalled={checkModels}
            />
          )}
        </Panel>
      </Page>
    );
  }

  const modelOptions = [
    { id: "general" as ModelType, label: t("upscale.models.general"), size: "~4.8 MB" },
    { id: "anime" as ModelType, label: t("upscale.models.anime"), size: "~17.9 MB" },
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
          <div style={{ display: "flex", gap: "6px" }}>
            <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
              {t("upscale.changeImage")}
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([form.sourcePath], "upscale")}
            >
              {t("transfer.sendTo")}
            </Button>
          </div>
        }
      >
        {!currentModelReady && (
          <ModelDownloadBanner
            depId={form.model === "general" ? "upscale_general" : "upscale_anime"}
            modelName={form.model === "general" ? "General (x4v3)" : "Anime (x4plus)"}
            sizeEstimate={form.model === "general" ? "~4.8 MB" : "~17.9 MB"}
            onInstalled={checkModels}
          />
        )}

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
                    setOutFileName(getDefaultOutFileName(form.sourcePath, nextScale));
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
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              onClick={() => useTransferStore.getState().openModal([form.result!.resultPath], "upscale")}
            >
              {t("transfer.sendTo")}
            </Button>
            <Button appearance="primary" icon={<Save16Regular />} onClick={saveDirect}>
              {t("common.saveBtn")}
            </Button>
            <Button appearance="subtle" icon={<FolderOpen16Regular />} onClick={saveAsDialog}>
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

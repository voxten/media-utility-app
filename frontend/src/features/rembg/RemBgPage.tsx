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
  Checkmark16Regular,
  Cut16Filled,
  Dismiss16Regular,
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
import type { RemBgOptions, RemBgPreview, RemBgResult } from "../../lib/types";
import { useJob } from "../../stores/jobs";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];

type ModelType = "birefnet" | "birefnet-lite" | "isnet" | "u2net";
type BgMode = "checker" | "black" | "white" | "green";

interface RemBgFormState {
  image: RemBgPreview | null;
  sourcePath: string;
  result: RemBgResult | null;
  model: ModelType;
  antiHalo: boolean;
  choke: number;
  feather: number;
  despeckle: boolean;
  bgMode: BgMode;
  set: (patch: Partial<Omit<RemBgFormState, "set">>) => void;
}

const useForm = create<RemBgFormState>((set) => ({
  image: null,
  sourcePath: "",
  result: null,
  model: "birefnet",
  antiHalo: true,
  choke: 1,
  feather: 0,
  despeckle: true,
  bgMode: "checker",
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
  chokeDropdown: {
    minWidth: "130px",
  },
  bgSelector: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  bgBtn: {
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    ...shorthands.border("2px", "solid", tokens.colorNeutralStroke1),
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transitionProperty: "transform, border-color",
    transitionDuration: "0.15s",
    transitionTimingFunction: "ease",
    ":hover": {
      transform: "scale(1.08)",
    },
  },
  bgBtnActive: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
  },
  bgChecker: {
    backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
    backgroundSize: "8px 8px",
    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
    backgroundColor: "#fff",
  },
  bgBlack: {
    backgroundColor: "#080c14",
  },
  bgWhite: {
    backgroundColor: "#ffffff",
  },
  bgGreen: {
    backgroundColor: "#10b981",
  },
  switchGroup: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  switchItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  stage: {
    height: "min(64vh, 660px)",
    minHeight: "340px",
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: "16px",
    boxSizing: "border-box",
    position: "relative",
    transitionProperty: "background",
    transitionDuration: "0.2s",
    transitionTimingFunction: "ease",
  },
  stageChecker: {
    backgroundColor: tokens.colorNeutralBackground3,
    backgroundImage: `linear-gradient(45deg, ${tokens.colorNeutralBackground4} 25%, transparent 25%), linear-gradient(-45deg, ${tokens.colorNeutralBackground4} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${tokens.colorNeutralBackground4} 75%), linear-gradient(-45deg, transparent 75%, ${tokens.colorNeutralBackground4} 75%)`,
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
  },
  stageBlack: {
    backgroundColor: "#070b12",
  },
  stageWhite: {
    backgroundColor: "#ffffff",
  },
  stageGreen: {
    backgroundColor: "#047857",
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
    gap: "8px",
    color: tokens.colorNeutralForeground3,
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
    width: "220px",
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
  modelProgressBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: "220px",
  },
  modelProgressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  infoText: {
    lineHeight: "1.6",
    color: tokens.colorNeutralForeground2,
  },
});

function ModelBanner({ onInstalled }: { onInstalled: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  useEffect(() => {
    if (!job) return;
    if (job.status === "done") {
      notify.success(t("rembg.modelPromo.ready"));
      onInstalled();
      setJobId(null);
    } else if (job.status === "error") {
      notify.error(t("settings.deps.failed"), { body: job.error ?? undefined });
    }
  }, [job?.status, job?.error, notify, onInstalled, t]);

  const handleInstall = async () => {
    try {
      const id = await api.system.installDependency("rembg");
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
          <Text weight="semibold">{t("rembg.modelPromo.title")}</Text>
          <Caption1>{t("rembg.modelPromo.desc")}</Caption1>
        </div>
      </div>
      <div className={styles.modelBannerRight}>
        {isRunning ? (
          <div className={styles.modelProgressBox}>
            <div className={styles.modelProgressHeader}>
              <Caption1>{job.message ? t(job.message, job.params) : t("rembg.modelPromo.installing")}</Caption1>
              <Button appearance="subtle" size="small" icon={<Dismiss16Regular />} onClick={handleCancel} title={t("common.cancel")} />
            </div>
            <ProgressBar value={job.percent != null ? job.percent / 100 : undefined} />
          </div>
        ) : (
          <Button appearance="primary" icon={<ArrowDownload16Regular />} onClick={handleInstall}>
            {t("rembg.modelPromo.installBtn")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function RemBgPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const form = useForm();
  const defaultDir = useSettings((s) => s.settings?.outputDir);
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [outDir, setOutDir] = useState<string>("");
  const [outFileName, setOutFileName] = useState<string>("");

  const checkAvailability = async () => {
    try {
      const ok = await api.rembg.isAvailable();
      setModelAvailable(ok);
    } catch {
      setModelAvailable(false);
    }
  };

  useEffect(() => {
    checkAvailability();
  }, []);

  const runner = useJobRunner<RemBgResult>("rembg", {
    onDone: (result) => {
      form.set({ result });
      notify.success(t("rembg.status.done"), {
        body: result.elapsed ? t("rembg.preview.timeElapsed", { seconds: result.elapsed }) : undefined,
      });
    },
    onError: (err) => {
      notify.error(t("common.jobStatus.error"), { body: err });
    },
  });

  const load = async (path: string) => {
    try {
      const preview = await api.rembg.load(path);
      form.set({ image: preview, sourcePath: path, result: null });
      const base = fileName(path).replace(/\.[^.]+$/, "");
      const folder = dirName(path) || defaultDir || "";
      setOutDir(folder);
      setOutFileName(`${base}_nobg.png`);
    } catch (err) {
      notify.error(t("common.jobStatus.error"), { body: String(err) });
    }
  };

  const browse = async () => {
    const files = await api.dialogs.openFiles(["Image files (*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.tiff)"], false);
    if (files.length > 0) load(files[0]);
  };

  const run = () => {
    if (!form.image || runner.running) return;
    const opts: RemBgOptions = {
      path: form.sourcePath,
      model: form.model,
      antiHalo: form.antiHalo,
      choke: form.choke,
      feather: form.feather,
      despeckle: form.despeckle,
    };
    runner.start(() => api.rembg.remove(opts)).catch((err) => notify.error(String(err)));
  };

  const saveTo = async (ext?: string) => {
    if (!form.result) return;
    try {
      let name = outFileName.trim() || `${fileName(form.sourcePath).replace(/\.[^.]+$/, "")}_nobg.png`;
      if (ext) {
        name = name.replace(/\.[^.]+$/, "") + ext;
      }
      const folder = outDir.trim() || dirName(form.sourcePath);
      const target = joinPath(folder, name);
      const saved = await api.rembg.save(form.result.resultPath, target);
      notify.success(t("common.savedSuccess"), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(saved).catch(() => undefined),
        },
      });
    } catch (err) {
      notify.error(t("common.jobStatus.error"), { body: String(err) });
    }
  };

  const saveAsDialog = async () => {
    if (!form.result) return;
    try {
      const target = await api.dialogs.saveFile(
        outFileName || `${fileName(form.sourcePath).replace(/\.[^.]+$/, "")}_nobg.png`,
        ["PNG (*.png)", "WEBP (*.webp)"],
        outDir || dirName(form.sourcePath)
      );
      if (!target) return;
      const saved = await api.rembg.save(form.result.resultPath, target);
      notify.success(t("common.savedSuccess"), {
        action: {
          label: t("common.showInFolder"),
          onClick: () => api.system.reveal(saved).catch(() => undefined),
        },
      });
    } catch (err) {
      notify.error(t("common.jobStatus.error"), { body: String(err) });
    }
  };

  const tool = toolById("rembg")!;

  if (!form.image) {
    return (
      <Page title={t("tools.rembg.name")} description={t("tools.rembg.description")} icon={tool.icon} accent={tool.accent}>
        <DropZone
          icon={Image24Regular}
          title={t("rembg.dropTitle")}
          hint={t("rembg.dropHint")}
          accept={IMAGE_EXTENSIONS}
          onFiles={(paths) => load(paths[0])}
          onBrowse={browse}
        />
        <Panel title={t("rembg.howTitle")}>
          <Text className={styles.infoText}>{t("rembg.howBody")}</Text>
          {modelAvailable === false && <ModelBanner onInstalled={() => setModelAvailable(true)} />}
        </Panel>
      </Page>
    );
  }

  const modelOptions = [
    { id: "birefnet", label: t("rembg.options.modelBirefnet") },
    { id: "birefnet-lite", label: t("rembg.options.modelBirefnetLite") },
    { id: "isnet", label: t("rembg.options.modelIsnet") },
    { id: "u2net", label: t("rembg.options.modelU2net") },
  ];

  const chokeOptions = [
    { value: 0, label: "0 px (Bez cięcia)" },
    { value: 1, label: "1 px (Zalecane)" },
    { value: 2, label: "2 px (Mocniejsze)" },
    { value: 3, label: "3 px (Maksymalne)" },
  ];

  const getStageClass = () => {
    switch (form.bgMode) {
      case "black":
        return styles.stageBlack;
      case "white":
        return styles.stageWhite;
      case "green":
        return styles.stageGreen;
      default:
        return styles.stageChecker;
    }
  };

  return (
    <Page title={t("tools.rembg.name")} description={t("tools.rembg.description")} icon={tool.icon} accent={tool.accent}>
      <Panel
        title={
          <span className={styles.fileRow}>
            <Image24Regular />
            <Text weight="semibold">{fileName(form.sourcePath)}</Text>
            <Caption1>
              {form.image.width}×{form.image.height} px
            </Caption1>
            <Badge appearance="tint" color="brand">
              BiRefNet
            </Badge>
          </span>
        }
        actions={
          <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
            {t("rembg.changeImage")}
          </Button>
        }
      >
        {modelAvailable === false && <ModelBanner onInstalled={() => setModelAvailable(true)} />}

        <Toolbar className={styles.toolbar}>
          {/* Model selection */}
          <div className={styles.optionItem}>
            <Text size={200} weight="semibold">
              {t("rembg.options.model")}
            </Text>
            <Dropdown
              className={styles.modelDropdown}
              value={modelOptions.find((m) => m.id === form.model)?.label}
              selectedOptions={[form.model]}
              onOptionSelect={(_, d) => form.set({ model: d.optionValue as ModelType })}
            >
              {modelOptions.map((m) => (
                <Option key={m.id} value={m.id}>
                  {m.label}
                </Option>
              ))}
            </Dropdown>
          </div>

          {/* Choke (Edge shaving) */}
          <div className={styles.optionItem}>
            <Tooltip content={t("rembg.options.chokeHint")} relationship="label">
              <Text size={200} weight="semibold">
                {t("rembg.options.choke")}
              </Text>
            </Tooltip>
            <Dropdown
              className={styles.chokeDropdown}
              value={chokeOptions.find((c) => c.value === form.choke)?.label}
              selectedOptions={[String(form.choke)]}
              onOptionSelect={(_, d) => form.set({ choke: Number(d.optionValue) })}
            >
              {chokeOptions.map((c) => (
                <Option key={c.value} value={String(c.value)}>
                  {c.label}
                </Option>
              ))}
            </Dropdown>
          </div>

          {/* Background Switcher for Preview */}
          <div className={styles.optionItem}>
            <Text size={200} weight="semibold">
              {t("rembg.options.previewBg")}
            </Text>
            <div className={styles.bgSelector}>
              <Tooltip content={t("rembg.options.bgChecker")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgChecker")}
                  className={`${styles.bgBtn} ${styles.bgChecker} ${form.bgMode === "checker" ? styles.bgBtnActive : ""}`}
                  onClick={() => form.set({ bgMode: "checker" })}
                >
                  {form.bgMode === "checker" && <Checkmark16Regular style={{ color: "#333" }} />}
                </button>
              </Tooltip>
              <Tooltip content={t("rembg.options.bgBlack")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgBlack")}
                  className={`${styles.bgBtn} ${styles.bgBlack} ${form.bgMode === "black" ? styles.bgBtnActive : ""}`}
                  onClick={() => form.set({ bgMode: "black" })}
                >
                  {form.bgMode === "black" && <Checkmark16Regular style={{ color: "#fff" }} />}
                </button>
              </Tooltip>
              <Tooltip content={t("rembg.options.bgWhite")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgWhite")}
                  className={`${styles.bgBtn} ${styles.bgWhite} ${form.bgMode === "white" ? styles.bgBtnActive : ""}`}
                  onClick={() => form.set({ bgMode: "white" })}
                >
                  {form.bgMode === "white" && <Checkmark16Regular style={{ color: "#000" }} />}
                </button>
              </Tooltip>
              <Tooltip content={t("rembg.options.bgCustom")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgCustom")}
                  className={`${styles.bgBtn} ${styles.bgGreen} ${form.bgMode === "green" ? styles.bgBtnActive : ""}`}
                  onClick={() => form.set({ bgMode: "green" })}
                >
                  {form.bgMode === "green" && <Checkmark16Regular style={{ color: "#fff" }} />}
                </button>
              </Tooltip>
            </div>
          </div>

          <Divider vertical style={{ height: "40px" }} />

          {/* Switches */}
          <div className={styles.switchGroup}>
            <Tooltip content={t("rembg.options.antiHaloHint")} relationship="label">
              <div className={styles.switchItem}>
                <Switch
                  checked={form.antiHalo}
                  onChange={(_, d) => form.set({ antiHalo: d.checked })}
                  label={
                    <Text size={200} weight="semibold">
                      {t("rembg.options.antiHalo")}
                    </Text>
                  }
                />
              </div>
            </Tooltip>

            <Tooltip content={t("rembg.options.despeckleHint")} relationship="label">
              <div className={styles.switchItem}>
                <Switch
                  checked={form.despeckle}
                  onChange={(_, d) => form.set({ despeckle: d.checked })}
                  label={
                    <Text size={200} weight="semibold">
                      {t("rembg.options.despeckle")}
                    </Text>
                  }
                />
              </div>
            </Tooltip>
          </div>
        </Toolbar>

        {/* Visual Stage with Before / After ImageComparison */}
        <div className={`${styles.stage} ${getStageClass()}`}>
          {form.result ? (
            <ImageComparison
              before={form.image.dataUrl}
              after={form.result.dataUrl}
              beforeLabel={t("rembg.preview.before")}
              afterLabel={t("rembg.preview.after")}
              maxHeight="calc(min(64vh, 660px) - 32px)"
              aspectRatio={form.image.width && form.image.height ? form.image.width / form.image.height : undefined}
            />
          ) : (
            <img src={form.image.dataUrl} alt="Original" className={styles.stagePreview} draggable={false} />
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
            ? form.result.elapsed
              ? t("rembg.preview.timeElapsed", { seconds: form.result.elapsed })
              : t("rembg.status.done")
            : runner.running
            ? t("rembg.actions.processing")
            : t("common.status.working")
        }
        onCancel={runner.cancel}
      >
        {form.result ? (
          <>
            <Button icon={<Sparkle16Filled />} disabled={runner.running} onClick={run}>
              {t("rembg.actions.remove")}
            </Button>
            <Button icon={<Save16Regular />} onClick={() => saveTo(".webp")}>
              {t("rembg.actions.saveWebp")}
            </Button>
            <Button appearance="primary" icon={<Save16Regular />} onClick={() => saveTo(".png")}>
              {t("common.saveBtn")}
            </Button>
            <Button appearance="subtle" icon={<FolderOpen16Regular />} onClick={saveAsDialog}>
              {t("common.saveAs")}
            </Button>
          </>
        ) : (
          <Button appearance="primary" icon={<Cut16Filled />} disabled={runner.running} onClick={run}>
            {t("rembg.actions.remove")}
          </Button>
        )}
      </ActionBar>
    </Page>
  );
}

import { useEffect, useState } from "react";
import {
  Button,
  Caption1,
  Divider,
  Dropdown,
  makeStyles,
  mergeClasses,
  Option,
  shorthands,
  Switch,
  Text,
  Toolbar,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowForward16Regular,
  Checkmark16Regular,
  FolderOpen16Regular,
  Image24Regular,
  ImageEdit20Regular,
  Save16Regular,
  Wand16Filled,
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
import type { RemBgOptions, RemBgPreview, RemBgResult } from "../../lib/types";
import { } from "../../stores/jobs";
import { useJobRunner } from "../../lib/useJobRunner";
import { } from "../../stores/settings";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";

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
  checkDark: { color: tokens.colorNeutralForeground1Static },
  checkLight: { color: tokens.colorNeutralForegroundStaticInverted },
  divider: { height: "40px" },
});

function RemBgModelBanner({ onInstalled }: { onInstalled: () => void }) {
  const { t } = useTranslation();
  return (
    <ModelBanner
      depId="rembg"
      title={t("rembg.modelPromo.title")}
      description={t("rembg.modelPromo.desc")}
      installLabel={t("rembg.modelPromo.installBtn")}
      readyMessage={t("rembg.modelPromo.ready")}
      onInstalled={onInstalled}
    />
  );
}

export default function RemBgPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const notify = useNotify();
  const form = useForm();
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const output = useSaveOutput(api.rembg.save);

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
      output.reset(path, `${fileName(path).replace(/\.[^.]+$/, "")}_nobg.png`);
    } catch (err) {
      notify.error(t("common.jobStatus.error"), { body: String(err) });
    }
  };

  const openTransferModal = useTransferStore((s) => s.openModal);

  useIncomingTransfer("rembg", (files) => {
    if (files[0]) load(files[0]);
  });

  const browse = async () => {
    const files = await api.dialogs.openFiles([dialogFilter(t, "images")], false);
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
        {modelAvailable === false && <RemBgModelBanner onInstalled={() => setModelAvailable(true)} />}
      </Page>
    );
  }

  const modelOptions = [
    { id: "birefnet", label: t("rembg.options.modelBirefnet") },
    { id: "birefnet-lite", label: t("rembg.options.modelBirefnetLite") },
    { id: "isnet", label: t("rembg.options.modelIsnet") },
    { id: "u2net", label: t("rembg.options.modelU2net") },
  ];

  const chokeOptions = [0, 1, 2, 3].map((value) => ({
    value,
    label: value === 0 ? t("rembg.options.chokeNone") : `${value} px`,
  }));

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
          </span>
        }
        actions={
          <>
            {form.sourcePath && (
              <Button
                appearance="subtle"
                icon={<ArrowForward16Regular />}
                onClick={() => openTransferModal(form.result?.resultPath || form.sourcePath, "rembg")}
                title={t("transfer.buttonTooltip")}
              >
                {t("transfer.button")}
              </Button>
            )}
            <Button appearance="subtle" icon={<ImageEdit20Regular />} onClick={browse}>
              {t("rembg.changeImage")}
            </Button>
          </>
        }
      >
        {modelAvailable === false && <RemBgModelBanner onInstalled={() => setModelAvailable(true)} />}

        <Toolbar className={styles.toolbar}>
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

          <div className={styles.optionItem}>
            <Text size={200} weight="semibold">
              {t("rembg.options.previewBg")}
            </Text>
            <div className={styles.bgSelector}>
              <Tooltip content={t("rembg.options.bgChecker")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgChecker")}
                  className={mergeClasses(styles.bgBtn, styles.bgChecker, form.bgMode === "checker" && styles.bgBtnActive)}
                  onClick={() => form.set({ bgMode: "checker" })}
                >
                  {form.bgMode === "checker" && <Checkmark16Regular className={styles.checkDark} />}
                </button>
              </Tooltip>
              <Tooltip content={t("rembg.options.bgBlack")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgBlack")}
                  className={mergeClasses(styles.bgBtn, styles.bgBlack, form.bgMode === "black" && styles.bgBtnActive)}
                  onClick={() => form.set({ bgMode: "black" })}
                >
                  {form.bgMode === "black" && <Checkmark16Regular className={styles.checkLight} />}
                </button>
              </Tooltip>
              <Tooltip content={t("rembg.options.bgWhite")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgWhite")}
                  className={mergeClasses(styles.bgBtn, styles.bgWhite, form.bgMode === "white" && styles.bgBtnActive)}
                  onClick={() => form.set({ bgMode: "white" })}
                >
                  {form.bgMode === "white" && <Checkmark16Regular className={styles.checkDark} />}
                </button>
              </Tooltip>
              <Tooltip content={t("rembg.options.bgCustom")} relationship="label">
                <button
                  type="button"
                  aria-label={t("rembg.options.bgCustom")}
                  className={mergeClasses(styles.bgBtn, styles.bgGreen, form.bgMode === "green" && styles.bgBtnActive)}
                  onClick={() => form.set({ bgMode: "green" })}
                >
                  {form.bgMode === "green" && <Checkmark16Regular className={styles.checkLight} />}
                </button>
              </Tooltip>
            </div>
          </div>

          <Divider vertical className={styles.divider} />

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

        <div className={mergeClasses(styles.stage, getStageClass())}>
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
            <img src={form.image.dataUrl} alt={fileName(form.sourcePath)} className={styles.stagePreview} draggable={false} />
          )}
        </div>

        <SaveOutputFields output={output} />
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
            <Button icon={<Wand16Filled />} disabled={runner.running} onClick={run}>
              {t("rembg.actions.remove")}
            </Button>
            <Button appearance="primary" icon={<Save16Regular />} disabled={!output.canSave} onClick={() => output.saveHere(form.result!.resultPath)}>
              {t("common.saveBtn")}
            </Button>
            <Button
              appearance="subtle"
              icon={<FolderOpen16Regular />}
              onClick={() => output.saveAs(form.result!.resultPath, [dialogFilter(t, "images", [".png", ".webp"])])}
            >
              {t("common.saveAs")}
            </Button>
          </>
        ) : (
          <Button appearance="primary" icon={<Wand16Filled />} disabled={runner.running} onClick={run}>
            {t("rembg.actions.remove")}
          </Button>
        )}
      </ActionBar>
    </Page>
  );
}

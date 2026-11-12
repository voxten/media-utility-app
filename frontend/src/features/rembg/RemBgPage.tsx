import { useEffect, useState } from "react";
import {
  Button,
  Divider,
  makeStyles,
  mergeClasses,
  shorthands,
  Switch,
  Text,
  Toolbar,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import { Checkmark16Regular, Wand16Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { ModelBanner } from "../../components/ModelBanner";
import { Select } from "../../components/Select";
import { useNotify } from "../../components/notify";
import { useSaveOutput } from "../../components/SaveOutput";
import { SingleImageTool } from "../../components/SingleImageTool";
import { api } from "../../lib/bridge";
import { checkerboard } from "../../lib/checkerboard";
import { formatList, IMAGE_EXTENSIONS } from "../../lib/fileTypes";
import { fileName } from "../../lib/format";
import type { RemBgOptions, RemBgPreview, RemBgResult } from "../../lib/types";
import { useJobRunner } from "../../lib/useJobRunner";
import { errorMessage } from "../../lib/errors";

type ModelType = "birefnet" | "birefnet-lite" | "isnet" | "u2net";
type BgMode = "checker" | "black" | "white" | "green";

// Literal backdrops for judging the cutout; theme tokens would shift with light/dark mode.
const PREVIEW_COLORS = { black: "#000000", white: "#ffffff", green: "#00b140" } as const;

const BG_MODES: { id: BgMode; labelKey: string }[] = [
  { id: "checker", labelKey: "rembg.options.bgChecker" },
  { id: "black", labelKey: "rembg.options.bgBlack" },
  { id: "white", labelKey: "rembg.options.bgWhite" },
  { id: "green", labelKey: "rembg.options.bgGreen" },
];

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
  bgChecker: checkerboard(4),
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
  black: { backgroundColor: PREVIEW_COLORS.black },
  white: { backgroundColor: PREVIEW_COLORS.white },
  green: { backgroundColor: PREVIEW_COLORS.green },
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
  const output = useSaveOutput("rembg", api.rembg.save);

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
    onResult: (result) => form.set({ result }),
    onError: (err) => {
      notify.error(t("common.jobStatus.error"), { body: err });
    },
  });

  const load = async (path: string) => {
    try {
      const preview = await api.rembg.load(path);
      form.set({ image: preview, sourcePath: path, result: null });
      output.reset(`${fileName(path).replace(/\.[^.]+$/, "")}_nobg.png`);
    } catch (err) {
      notify.error(t("common.jobStatus.error"), { body: errorMessage(t, err) });
    }
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
    runner.start(() => api.rembg.remove(opts)).catch((err) => notify.error(errorMessage(t, err)));
  };

  const modelOptions = [
    { value: "birefnet" as ModelType, label: t("rembg.options.modelBirefnet") },
    { value: "birefnet-lite" as ModelType, label: t("rembg.options.modelBirefnetLite") },
    { value: "isnet" as ModelType, label: t("rembg.options.modelIsnet") },
    { value: "u2net" as ModelType, label: t("rembg.options.modelU2net") },
  ];

  const chokeOptions = [0, 1, 2, 3].map((value) => ({
    value: String(value),
    label: value === 0 ? t("rembg.options.chokeNone") : `${value} px`,
  }));

  const bgClass = (mode: BgMode) => (mode === "checker" ? styles.bgChecker : styles[mode]);

  const toolbar = (
    <Toolbar className={styles.toolbar}>
      <div className={styles.optionItem}>
        <Text size={200} weight="semibold">
          {t("rembg.options.model")}
        </Text>
        <Select
          className={styles.modelDropdown}
          options={modelOptions}
          value={form.model}
          onChange={(model) => form.set({ model })}
        />
      </div>

      <div className={styles.optionItem}>
        <Tooltip content={t("rembg.options.chokeHint")} relationship="label">
          <Text size={200} weight="semibold">
            {t("rembg.options.choke")}
          </Text>
        </Tooltip>
        <Select
          className={styles.chokeDropdown}
          options={chokeOptions}
          value={String(form.choke)}
          onChange={(v) => form.set({ choke: Number(v) })}
        />
      </div>

      <div className={styles.optionItem}>
        <Text size={200} weight="semibold">
          {t("rembg.options.previewBg")}
        </Text>
        <div className={styles.bgSelector}>
          {BG_MODES.map(({ id, labelKey }) => (
            <Tooltip key={id} content={t(labelKey)} relationship="label">
              <button
                type="button"
                aria-label={t(labelKey)}
                aria-pressed={form.bgMode === id}
                className={mergeClasses(styles.bgBtn, bgClass(id), form.bgMode === id && styles.bgBtnActive)}
                onClick={() => form.set({ bgMode: id })}
              >
                {form.bgMode === id && (
                  <Checkmark16Regular className={id === "black" || id === "green" ? styles.checkLight : styles.checkDark} />
                )}
              </button>
            </Tooltip>
          ))}
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
  );

  return (
    <SingleImageTool
      toolId="rembg"
      image={form.image}
      sourcePath={form.sourcePath}
      result={form.result}
      onLoad={load}
      dropTitle={t("rembg.dropTitle")}
      dropHint={t("rembg.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
      banner={modelAvailable === false && <RemBgModelBanner onInstalled={() => setModelAvailable(true)} />}
      toolbar={toolbar}
      stageClassName={form.bgMode === "checker" ? undefined : styles[form.bgMode]}
      afterLabel={t("rembg.preview.after")}
      output={output}
      saveExtensions={[".png", ".webp"]}
      job={runner.job}
      idleText={
        form.result
          ? form.result.elapsed
            ? t("rembg.preview.timeElapsed", { seconds: form.result.elapsed })
            : t("rembg.status.done")
          : modelAvailable === false
            ? t("rembg.idle.needModel")
            : t("rembg.idle.ready")
      }
      onCancel={runner.cancel}
      onRun={!runner.running && run}
      runAction={
        <Button appearance="primary" icon={<Wand16Filled />} disabled={runner.running} onClick={run}>
          {t("rembg.actions.remove")}
        </Button>
      }
      resultActions={
        <Button icon={<Wand16Filled />} disabled={runner.running} onClick={run}>
          {t("rembg.actions.remove")}
        </Button>
      }
    />
  );
}

import { useEffect, useMemo } from "react";
import {
  Button,
  Caption1,
  Dropdown,
  Field,
  makeStyles,
  mergeClasses,
  Option,
  Tab,
  TabList,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  ArrowSwap20Regular,
  Delete16Regular,
  Folder24Regular,
  FolderOpen16Regular,
  Image16Regular,
  ImageMultiple24Regular,
  Play16Filled,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { LogPanel } from "../../components/LogPanel";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { fileName, formatBytes } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useTransferStore } from "../../stores/transfer";
import { AfterGallery } from "../../components/AfterGallery";

const FORMATS = ["PNG", "WEBP", "JPEG", "GIF", "TIFF", "BMP", "PDF"] as const;
const LOSSY = new Set(["WEBP", "JPEG"]);
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"];

interface ConvertResult {
  total: number;
  converted: number;
  failed: number;
  inputBytes: number;
  outputBytes: number;
  outputDir: string;
  files?: string[];
  items?: Array<{
    source: string;
    dest: string;
    name: string;
    size: number;
    originalSize: number;
  }>;
}

interface ConverterForm {
  source: "folder" | "files";
  inputDir: string;
  files: string[];
  inFormat: string;
  outFormat: string;
  outputDir: string;
  quality: number;
  method: number;
  matching: number | null;
  set: (patch: Partial<Omit<ConverterForm, "set">>) => void;
}

const useForm = create<ConverterForm>((set) => ({
  source: "folder",
  inputDir: "",
  files: [],
  inFormat: "PNG",
  outFormat: "WEBP",
  outputDir: "",
  quality: 80,
  method: 6,
  matching: null,
  set: (patch) => set(patch),
}));

const useStyles = makeStyles({
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "16px",
    "@media (max-width: 1050px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  formats: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: "8px" },
  formatButton: { minWidth: 0, fontWeight: tokens.fontWeightSemibold },
  row: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", minWidth: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    maxHeight: "180px",
    overflowY: "auto",
  },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 4px 4px 10px",
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  fileName: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  statValue: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightBase500 },
  good: { color: tokens.colorPaletteGreenForeground1 },
  bad: { color: tokens.colorPaletteRedForeground1 },
});

function Summary({ result }: { result: ConvertResult }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const saved = result.inputBytes > 0 ? 1 - result.outputBytes / result.inputBytes : 0;
  return (
    <Panel
      title={t("converter.summary.title")}
      actions={
        <Button icon={<FolderOpen16Regular />} onClick={() => api.system.openPath(result.outputDir)}>
          {t("common.openFolder")}
        </Button>
      }
    >
      <div className={styles.summary}>
        <div className={styles.stat}>
          <Caption1 className={styles.muted}>{t("converter.summary.converted")}</Caption1>
          <span className={styles.statValue}>
            {result.converted} / {result.total}
          </span>
        </div>
        <div className={styles.stat}>
          <Caption1 className={styles.muted}>{t("converter.summary.failed")}</Caption1>
          <span className={mergeClasses(styles.statValue, result.failed > 0 && styles.bad)}>{result.failed}</span>
        </div>
        <div className={styles.stat}>
          <Caption1 className={styles.muted}>{t("converter.summary.size")}</Caption1>
          <span className={styles.statValue}>
            {formatBytes(result.inputBytes)} <ArrowRight16Regular /> {formatBytes(result.outputBytes)}
          </span>
        </div>
        <div className={styles.stat}>
          <Caption1 className={styles.muted}>{t("converter.summary.saved")}</Caption1>
          <span className={mergeClasses(styles.statValue, saved > 0 ? styles.good : styles.bad)}>
            {saved >= 0 ? "−" : "+"}
            {Math.abs(Math.round(saved * 100))}%
          </span>
        </div>
      </div>
    </Panel>
  );
}

export default function ConverterPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("converter")!;
  const form = useForm();
  const defaultOutput = useSettings((s) => s.settings?.outputDir ?? "");
  const outputDir = form.outputDir || defaultOutput;

  const runner = useJobRunner<ConvertResult>("converter", {
    onDone: (result) =>
      notify.success(t("converter.toast.done", { count: result.converted }), {
        body: result.failed ? t("converter.toast.failed", { count: result.failed }) : undefined,
        action: { label: t("common.openFolder"), onClick: () => api.system.openPath(result.outputDir) },
      }),
    onError: (error) => notify.error(t("converter.toast.error"), { body: error }),
  });

  // Live count of matching files in folder mode.
  useEffect(() => {
    if (form.source !== "folder" || !form.inputDir) {
      form.set({ matching: null });
      return;
    }
    const timer = window.setTimeout(() => {
      api.converter
        .countFiles(form.inputDir, form.inFormat)
        .then((matching) => form.set({ matching }))
        .catch(() => form.set({ matching: null }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form.source, form.inputDir, form.inFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileCount = form.source === "folder" ? form.matching ?? 0 : form.files.length;
  const canStart = fileCount > 0 && !!outputDir && !runner.running;

  const idleText = useMemo(() => {
    if (form.source === "folder" && !form.inputDir) return t("converter.idle.pickFolder");
    if (form.source === "files" && !form.files.length) return t("converter.idle.pickFiles");
    return t("converter.idle.ready", { count: fileCount });
  }, [form.source, form.inputDir, form.files.length, fileCount, t]);

  const addFiles = (paths: string[]) => form.set({ files: Array.from(new Set([...form.files, ...paths])) });

  useIncomingTransfer("converter", (files) => {
    if (files.length > 0) {
      form.set({ source: "files", files: Array.from(new Set([...form.files, ...files])) });
    }
  });

  const start = () =>
    runner
      .start(() =>
        api.converter.start({
          outputDir,
          outFormat: form.outFormat,
          quality: form.quality,
          method: form.method,
          ...(form.source === "folder" ? { inputDir: form.inputDir, inFormat: form.inFormat } : { files: form.files }),
        }),
      )
      .catch((err) => notify.error(t("converter.toast.error"), { body: String(err) }));

  return (
    <Page title={t("tools.converter.name")} description={t("tools.converter.description")} icon={tool.icon} accent={tool.accent}>
      <div className={styles.columns}>
        <Panel
          title={t("converter.source")}
          actions={
            <TabList size="small" selectedValue={form.source} onTabSelect={(_, d) => form.set({ source: d.value as "folder" | "files" })}>
              <Tab value="folder" icon={<Folder24Regular />}>
                {t("converter.sourceFolder")}
              </Tab>
              <Tab value="files" icon={<ImageMultiple24Regular />}>
                {t("converter.sourceFiles")}
              </Tab>
            </TabList>
          }
        >
          {form.source === "folder" ? (
            <>
              <Field label={t("converter.inputFolder")}>
                <PathPicker value={form.inputDir} onChange={(inputDir) => form.set({ inputDir })} />
              </Field>
              <div className={styles.row}>
                <Field label={t("converter.fromFormat")} className={styles.grow}>
                  <Dropdown
                    value={form.inFormat}
                    selectedOptions={[form.inFormat]}
                    onOptionSelect={(_, d) => form.set({ inFormat: d.optionValue! })}
                  >
                    {FORMATS.filter((f) => f !== "PDF").map((f) => (
                      <Option key={f}>{f}</Option>
                    ))}
                  </Dropdown>
                </Field>
                <Tooltip content={t("converter.swap")} relationship="label">
                  <Button
                    icon={<ArrowSwap20Regular />}
                    disabled={form.outFormat === "PDF"}
                    onClick={() => form.set({ inFormat: form.outFormat, outFormat: form.inFormat })}
                  />
                </Tooltip>
              </div>
              <Caption1 className={styles.muted}>
                {form.inputDir && form.matching != null
                  ? t("converter.matching", { count: form.matching, format: form.inFormat })
                  : t("converter.folderHint")}
              </Caption1>
            </>
          ) : (
            <>
              <DropZone
                compact={form.files.length > 0}
                title={t("converter.dropTitle")}
                hint={t("converter.dropHint")}
                accept={IMAGE_EXTENSIONS}
                onFiles={addFiles}
                onBrowse={async () =>
                  addFiles(await api.dialogs.openFiles([`${t("converter.images")} (${IMAGE_EXTENSIONS.map((e) => `*${e}`).join(";")})`]))
                }
              />
              {form.files.length > 0 && (
                <>
                  <div className={styles.fileList}>
                    {form.files.map((file) => (
                      <div key={file} className={styles.fileItem} title={file}>
                        <Image16Regular />
                        <Text className={styles.fileName}>{fileName(file)}</Text>
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<ArrowRight16Regular />}
                          aria-label={t("transfer.sendTo")}
                          title={t("transfer.sendTo")}
                          onClick={() => useTransferStore.getState().openModal([file], "converter")}
                        />
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<Delete16Regular />}
                          aria-label={t("common.remove")}
                          onClick={() => form.set({ files: form.files.filter((f) => f !== file) })}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button appearance="subtle" size="small" onClick={() => form.set({ files: [] })}>
                      {t("common.clearAll")}
                    </Button>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowRight16Regular />}
                      onClick={() => useTransferStore.getState().openModal(form.files, "converter")}
                    >
                      {t("transfer.sendTo")}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </Panel>

        <Panel title={t("converter.output")}>
          <Field label={t("converter.toFormat")}>
            <div className={styles.formats} role="radiogroup">
              {FORMATS.map((f) => (
                <Button
                  key={f}
                  role="radio"
                  aria-checked={form.outFormat === f}
                  className={styles.formatButton}
                  appearance={form.outFormat === f ? "primary" : "secondary"}
                  onClick={() => form.set({ outFormat: f })}
                >
                  {f}
                </Button>
              ))}
            </div>
          </Field>
          <SliderField
            label={t("converter.quality")}
            hint={LOSSY.has(form.outFormat) ? t("converter.qualityHint") : t("converter.qualityNA", { format: form.outFormat })}
            value={form.quality}
            min={1}
            max={100}
            disabled={!LOSSY.has(form.outFormat)}
            onChange={(quality) => form.set({ quality })}
          />
          {form.outFormat === "WEBP" && (
            <SliderField
              label={t("converter.method")}
              hint={t("converter.methodHint")}
              value={form.method}
              min={0}
              max={6}
              onChange={(method) => form.set({ method })}
            />
          )}
          <Field label={t("converter.outputFolder")}>
            <PathPicker value={outputDir} onChange={(dir) => form.set({ outputDir: dir })} openable />
          </Field>
        </Panel>
      </div>

      {runner.result && (
        <>
          <Summary result={runner.result} />
          {runner.result.files && runner.result.files.length > 0 && (
            <AfterGallery
              title={t("transfer.convertedTitle")}
              files={runner.result.files}
              items={runner.result.items?.map((it) => ({
                file: it.source,
                dest: it.dest,
                name: it.name,
                originalSize: it.originalSize,
                size: it.size,
                savedPercent:
                  it.originalSize > 0
                    ? Math.round((1 - it.size / it.originalSize) * 100)
                    : 0,
              }))}
              outputDir={runner.result.outputDir}
              sourceToolId="converter"
            />
          )}
        </>
      )}
      {runner.job && runner.job.logs.length > 0 && <LogPanel logs={runner.job.logs} />}

      <ActionBar job={runner.job} idleText={idleText} onCancel={runner.cancel}>
        <Button appearance="primary" icon={<Play16Filled />} disabled={!canStart} onClick={start}>
          {t("converter.start")}
        </Button>
      </ActionBar>
    </Page>
  );
}

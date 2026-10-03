import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Caption1,
  Combobox,
  Dropdown,
  Field,
  Input,
  makeStyles,
  Option,
  OptionGroup,
  Spinner,
  Tab,
  TabList,
  Textarea,
  tokens,
} from "@fluentui/react-components";
import { Cloud24Regular, Desktop24Regular, Dismiss16Regular, FolderOpen16Regular, MicSparkle16Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { toolById } from "../../app/tools";
import { ActionBar } from "../../components/ActionBar";
import { AudioPlayer } from "../../components/AudioPlayer";
import { useNotify } from "../../components/notify";
import { Page } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { PathPicker } from "../../components/PathPicker";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { joinPath } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";

type Engine = "edge" | "pyttsx3";
interface Voice {
  id: string;
  name: string;
  locale: string;
  gender: string;
}

const FORMATS = ["mp3", "wav", "ogg", "flac"] as const;
const RATE = {
  edge: { min: -50, max: 100, step: 5, default: 0, format: (v: number) => `${v > 0 ? "+" : ""}${v}%` },
  pyttsx3: { min: 80, max: 320, step: 10, default: 200, format: (v: number) => `${v} wpm` },
};

interface TtsForm {
  text: string;
  engine: Engine;
  voice: string;
  locale: string;
  rate: { edge: number; pyttsx3: number };
  format: (typeof FORMATS)[number];
  outDir: string;
  fileName: string;
  audioSrc: string | null;
  lastOutput: string | null;
  set: (patch: Partial<Omit<TtsForm, "set">>) => void;
}

const useForm = create<TtsForm>((set) => ({
  text: "",
  engine: "edge",
  voice: "",
  locale: "",
  rate: { edge: 0, pyttsx3: 200 },
  format: "mp3",
  outDir: "",
  fileName: "",
  audioSrc: null,
  lastOutput: null,
  set: (patch) => set(patch),
}));

const voiceCache: Partial<Record<Engine, Voice[]>> = {};

const useStyles = makeStyles({
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
    gap: "16px",
    "@media (max-width: 1050px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  textarea: {
    minHeight: "280px",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    "& textarea": {
      maxHeight: "none",
      minHeight: "inherit",
      boxSizing: "border-box",
      flexGrow: 1,
      height: "100%",
      fontSize: tokens.fontSizeBase400,
      lineHeight: tokens.lineHeightBase400,
    },
  },
  counter: { display: "flex", justifyContent: "space-between", color: tokens.colorNeutralForeground3 },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 110px",
    gap: "12px",
    alignItems: "start",
    "@media (max-width: 480px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  narrowDropdown: { minWidth: "0", width: "100%" },
  muted: { color: tokens.colorNeutralForeground3 },
  engineHint: { color: tokens.colorNeutralForeground3 },
  player: { display: "flex", flexDirection: "column", gap: "10px" },
  playerActions: { display: "flex", gap: "8px" },
});

export default function TtsPage() {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const tool = toolById("tts")!;
  const form = useForm();
  const outputDir = useSettings((s) => s.settings?.outputDir ?? "");
  const [voices, setVoices] = useState<Voice[] | null>(voiceCache[form.engine] ?? null);
  const [query, setQuery] = useState<string | null>(null);

  const runner = useJobRunner<{ outPath: string; bytes: number }>("tts", {
    onDone: async (result) => {
      notify.success(t("tts.toast.done"), {
        body: result.outPath,
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(result.outPath).catch(() => undefined) },
      });
      try {
        form.set({ audioSrc: await api.tts.audioDataUrl(result.outPath), lastOutput: result.outPath });
      } catch {
        form.set({ audioSrc: null, lastOutput: result.outPath });
      }
    },
    onError: (error) => notify.error(t("tts.toast.error"), { body: error }),
  });

  // Clean up preview if the output file was deleted on disk.
  useEffect(() => {
    if (!form.lastOutput) return;
    const verifyFile = () => {
      api.system.pathInfo(form.lastOutput!).then((info) => {
        if (!info.exists) {
          form.set({ audioSrc: null, lastOutput: null });
        }
      }).catch(() => undefined);
    };
    verifyFile();
    window.addEventListener("focus", verifyFile);
    return () => window.removeEventListener("focus", verifyFile);
  }, [form.lastOutput]);

  // Load voices per engine (Edge needs the network; cached for the session).
  useEffect(() => {
    let cancelled = false;
    const cached = voiceCache[form.engine];
    if (cached) {
      setVoices(cached);
      return;
    }
    setVoices(null);
    api.tts
      .voices(form.engine)
      .then((list) => {
        voiceCache[form.engine] = list;
        if (!cancelled) setVoices(list);
      })
      .catch(() => !cancelled && setVoices([]));
    return () => {
      cancelled = true;
    };
  }, [form.engine]);

  const locales = useMemo(() => Array.from(new Set((voices ?? []).map((v) => v.locale).filter(Boolean))).sort(), [voices]);

  // Sensible defaults: the UI language's locale and its first voice.
  useEffect(() => {
    if (!voices?.length) return;
    const preferred = i18n.language === "pl" ? "pl-PL" : "en-US";
    const locale = locales.includes(form.locale) ? form.locale : locales.includes(preferred) ? preferred : locales[0] ?? "";
    const voiceOk = voices.some((v) => v.id === form.voice && (!locale || v.locale === locale));
    form.set({ locale, voice: voiceOk ? form.voice : voices.find((v) => v.locale === locale)?.id ?? voices[0].id });
  }, [voices]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleVoices = (voices ?? []).filter(
    (v) => (!form.locale || v.locale === form.locale) && (!query || `${v.name} ${v.id}`.toLowerCase().includes(query.toLowerCase())),
  );
  const selectedVoice = voices?.find((v) => v.id === form.voice);
  const rateCfg = RATE[form.engine];
  const effectiveOutDir = form.outDir || outputDir;
  const rawName = form.fileName.trim() || t("tts.defaultName");
  const cleanName = rawName.replace(/\.[^.\\/]+$/, "");
  const effectiveFileName = `${cleanName}.${form.format}`;
  const outPath = joinPath(effectiveOutDir, effectiveFileName);
  const words = form.text.trim() ? form.text.trim().split(/\s+/).length : 0;

  const setFormat = (format: (typeof FORMATS)[number]) => form.set({ format });

  const start = () =>
    runner
      .start(() =>
        api.tts.synthesize({ text: form.text, engine: form.engine, voice: form.voice, rate: form.rate[form.engine], outPath }),
      )
      .catch((err) => notify.error(t("tts.toast.error"), { body: String(err) }));

  return (
    <Page title={t("tools.tts.name")} description={t("tools.tts.description")} icon={tool.icon} accent={tool.accent}>
      <div className={styles.columns}>
        <Panel title={t("tts.text")}>
          <Textarea
            className={styles.textarea}
            resize="vertical"
            value={form.text}
            placeholder={t("tts.placeholder")}
            onChange={(_, d) => form.set({ text: d.value })}
          />
          <div className={styles.counter}>
            <Caption1>{t("tts.counter", { chars: form.text.length, words })}</Caption1>
            {form.text && (
              <Button appearance="subtle" size="small" onClick={() => form.set({ text: "" })}>
                {t("common.clear")}
              </Button>
            )}
          </div>
        </Panel>

        <Panel title={t("tts.voice")}>
          <TabList size="small" selectedValue={form.engine} onTabSelect={(_, d) => form.set({ engine: d.value as Engine })}>
            <Tab value="edge" icon={<Cloud24Regular />}>
              {t("tts.engineEdge")}
            </Tab>
            <Tab value="pyttsx3" icon={<Desktop24Regular />}>
              {t("tts.engineLocal")}
            </Tab>
          </TabList>
          <Caption1 className={styles.engineHint}>{form.engine === "edge" ? t("tts.engineEdgeHint") : t("tts.engineLocalHint")}</Caption1>

          {voices === null ? (
            <Spinner size="small" label={t("tts.loadingVoices")} />
          ) : (
            <>
              {locales.length > 1 && (
                <Field label={t("tts.language")}>
                  <Combobox
                    value={form.locale}
                    selectedOptions={[form.locale]}
                    onOptionSelect={(_, d) => {
                      const locale = d.optionValue ?? "";
                      form.set({ locale, voice: voices.find((v) => v.locale === locale)?.id ?? form.voice });
                    }}
                  >
                    {locales.map((l) => (
                      <Option key={l} value={l}>
                        {l}
                      </Option>
                    ))}
                  </Combobox>
                </Field>
              )}
              <Field label={t("tts.voiceLabel")} validationMessage={voices.length === 0 ? t("tts.noVoices") : undefined}>
                <Combobox
                  value={query ?? (selectedVoice ? `${selectedVoice.name} (${selectedVoice.locale})` : "")}
                  selectedOptions={form.voice ? [form.voice] : []}
                  onChange={(e) => setQuery(e.target.value)}
                  onOptionSelect={(_, d) => {
                    if (d.optionValue) form.set({ voice: d.optionValue });
                    setQuery(null);
                  }}
                  onBlur={() => setQuery(null)}
                  placeholder={t("tts.searchVoice")}
                >
                  <OptionGroup label={form.locale || t("tts.allVoices")}>
                    {visibleVoices.map((v) => (
                      <Option key={v.id} value={v.id} text={`${v.name} (${v.locale})`}>
                        {v.name}
                        {v.gender ? ` · ${t(`tts.gender.${v.gender.toLowerCase()}`, { defaultValue: v.gender })}` : ""}
                      </Option>
                    ))}
                  </OptionGroup>
                </Combobox>
              </Field>
            </>
          )}

          <SliderField
            label={t("tts.rate")}
            value={form.rate[form.engine]}
            min={rateCfg.min}
            max={rateCfg.max}
            step={rateCfg.step}
            format={rateCfg.format}
            onChange={(v) => form.set({ rate: { ...form.rate, [form.engine]: v } })}
          />

          <Field label={t("tts.outputFolder")}>
            <PathPicker
              value={effectiveOutDir}
              onChange={(dir) => form.set({ outDir: dir })}
              openable
            />
          </Field>

          <div className={styles.row}>
            <Field label={t("tts.fileName")}>
              <Input
                value={form.fileName}
                placeholder={t("tts.defaultName")}
                onChange={(_, d) => form.set({ fileName: d.value })}
                contentAfter={<Caption1 className={styles.muted}>.{form.format}</Caption1>}
              />
            </Field>
            <Field label={t("tts.format")}>
              <Dropdown
                className={styles.narrowDropdown}
                value={form.format.toUpperCase()}
                selectedOptions={[form.format]}
                onOptionSelect={(_, d) => setFormat(d.optionValue as (typeof FORMATS)[number])}
              >
                {FORMATS.map((f) => (
                  <Option key={f} value={f}>
                    {f.toUpperCase()}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          </div>
        </Panel>
      </div>

      {form.audioSrc && (
        <Panel
          title={t("tts.preview")}
          actions={
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {form.lastOutput && (
                <Button appearance="subtle" icon={<FolderOpen16Regular />} onClick={() => api.system.reveal(form.lastOutput!).catch(() => undefined)}>
                  {t("common.showInFolder")}
                </Button>
              )}
              <Button
                appearance="subtle"
                size="small"
                icon={<Dismiss16Regular />}
                onClick={() => form.set({ audioSrc: null, lastOutput: null })}
                aria-label={t("common.clear")}
              />
            </div>
          }
        >
          <AudioPlayer src={form.audioSrc} autoPlay />
        </Panel>
      )}

      <ActionBar
        job={runner.running ? runner.job : undefined}
        idleText={form.text.trim() ? t("tts.idle.ready", { voice: selectedVoice?.name ?? "—" }) : t("tts.idle.empty")}
        onCancel={runner.cancel}
      >
        <Button appearance="primary" icon={<MicSparkle16Filled />} disabled={!form.text.trim() || !form.voice || runner.running} onClick={start}>
          {t("tts.generate")}
        </Button>
      </ActionBar>
    </Page>
  );
}

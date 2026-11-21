import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Caption1,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  Spinner,
  Tab,
  TabList,
  Textarea,
  tokens,
} from "@fluentui/react-components";
import { Cloud24Regular, Desktop24Regular, Dismiss16Regular, FolderOpen16Regular, Speaker216Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { AudioPlayer } from "../../components/AudioPlayer";
import { useNotify } from "../../components/notify";
import { Columns } from "../../components/Columns";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { OutputFolderField, useOutputDir } from "../../components/OutputFolderField";
import { Select } from "../../components/Select";
import { SliderField } from "../../components/SliderField";
import { api } from "../../lib/bridge";
import { useOpenPath } from "../../lib/useOpenPath";
import { dialogFilter, formatOptions } from "../../lib/fileTypes";
import { joinPath } from "../../lib/format";
import { useJobRunner } from "../../lib/useJobRunner";
import { errorMessage } from "../../lib/errors";
import { claimDrop, DROP_ZONE_ATTR, matchesExtensions } from "../../lib/drop";
import { useToolShortcuts } from "../../lib/useToolShortcuts";
import { FORMATS, useTtsForm, type AudioFormat, type Engine } from "./store";

const TEXT_EXTENSIONS = [".txt"];

interface Voice {
  id: string;
  name: string;
  locale: string;
  gender: string;
}

const RATE = {
  edge: { min: -50, max: 100, step: 5, default: 0, format: (v: number) => `${v > 0 ? "+" : ""}${v}%` },
  pyttsx3: { min: 80, max: 320, step: 10, default: 200, format: null },
};

const voiceCache: Partial<Record<Engine, Voice[]>> = {};

const useStyles = makeStyles({
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
  dropOver: { "& textarea": { backgroundColor: tokens.colorBrandBackground2 } },
  engineHint: { color: tokens.colorNeutralForeground3 },
  player: { display: "flex", flexDirection: "column", gap: "10px" },
  playerActions: { display: "flex", gap: "8px" },
});

export default function TtsPage() {
  const { t, i18n } = useTranslation();
  const { reveal } = useOpenPath();
  const styles = useStyles();
  const notify = useNotify();
  const form = useTtsForm();
  const [voices, setVoices] = useState<Voice[] | null>(voiceCache[form.engine] ?? null);
  const [dropOver, setDropOver] = useState(false);
  // Local, so a recording plays by itself only right after it is made, not on every visit.
  const [autoPlay, setAutoPlay] = useState(false);

  const runner = useJobRunner<{ outPath: string; bytes: number }>("tts", {
    onResult: async (result) => {
      try {
        form.set({ audioSrc: await api.tts.audioUrl(result.outPath), lastOutput: result.outPath });
      } catch {
        form.set({ audioSrc: null, lastOutput: result.outPath });
      }
    },
    onDone: () => setAutoPlay(true),
    onError: (error) => notify.error(t("tts.toast.error"), { body: error }),
  });

  // Clean up preview if the output file was deleted on disk.
  const lastOutput = form.lastOutput;
  const setForm = form.set;
  useEffect(() => {
    if (!lastOutput) return;
    const verifyFile = () => {
      api.system.pathInfo(lastOutput).then((info) => {
        if (!info.exists) {
          setForm({ audioSrc: null, lastOutput: null });
        }
      }).catch(() => undefined);
    };
    verifyFile();
    window.addEventListener("focus", verifyFile);
    return () => window.removeEventListener("focus", verifyFile);
  }, [lastOutput, setForm]);

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
    const voiceLocale = voices.find((v) => v.id === form.voice)?.locale ?? "";
    const locale = [form.locale, voiceLocale, preferred].find((l) => locales.includes(l)) ?? locales[0] ?? "";
    const voiceOk = voices.some((v) => v.id === form.voice && (!locale || v.locale === locale));
    form.set({ locale, voice: voiceOk ? form.voice : voices.find((v) => v.locale === locale)?.id ?? voices[0].id });
  }, [voices]); // eslint-disable-line react-hooks/exhaustive-deps -- defaults only when a voice list loads, never over the user's pick

  const localeOptions = useMemo(() => {
    const names = new Intl.DisplayNames([i18n.language], { type: "language" });
    return locales.map((l) => ({ value: l, label: `${names.of(l) ?? l} · ${l}` }));
  }, [locales, i18n.language]);

  const voiceOptions = (voices ?? [])
    .filter((v) => !form.locale || v.locale === form.locale)
    .map((v) => {
      const gender = v.gender ? t(`tts.gender.${v.gender.toLowerCase()}`, { defaultValue: v.gender }) : "";
      return {
        value: v.id,
        label: `${v.name} (${v.locale})`,
        content: gender ? `${v.name} · ${gender}` : v.name,
        keywords: `${v.id} ${gender}`,
      };
    });
  const rateCfg = RATE[form.engine];
  const effectiveOutDir = useOutputDir(form.outDir);
  const rawName = form.fileName.trim() || t("tts.defaultName");
  const cleanName = rawName.replace(/\.[^.\\/]+$/, "");
  const effectiveFileName = `${cleanName}.${form.format}`;
  const outPath = joinPath(effectiveOutDir, effectiveFileName);
  const words = form.text.trim() ? form.text.trim().split(/\s+/).length : 0;

  const setFormat = (format: AudioFormat) => form.set({ format });

  const canStart = !!form.text.trim() && !!form.voice && !runner.running;
  const start = () =>
    runner
      .start(() =>
        api.tts.synthesize({ text: form.text, engine: form.engine, voice: form.voice, rate: form.rate[form.engine], outPath }),
      )
      .catch((err) => notify.error(t("tts.toast.error"), { body: errorMessage(t, err) }));

  /** A text file's content replaces an empty text or goes after the text already there. */
  const loadTextFile = async (path: string | undefined) => {
    if (!path) return;
    if (!matchesExtensions(path, TEXT_EXTENSIONS)) {
      notify.warning(t("tts.errors.notText"));
      return;
    }
    try {
      const text = (await api.tts.readText(path)).trim();
      const current = useTtsForm.getState().text.trimEnd();
      form.set({ text: current ? `${current}\n\n${text}` : text });
    } catch (err) {
      notify.error(t("tts.errors.readText"), { body: errorMessage(t, err) });
    }
  };

  const openTextFile = async () => {
    const [path] = await api.dialogs.openFiles([dialogFilter(t, "text", TEXT_EXTENSIONS)], false);
    await loadTextFile(path);
  };

  useToolShortcuts({ run: canStart && start, open: openTextFile });

  const voicePanel = (
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
              <Select
                searchable
                options={localeOptions}
                value={form.locale}
                onChange={(locale) => form.set({ locale, voice: voices.find((v) => v.locale === locale)?.id ?? form.voice })}
              />
            </Field>
          )}
          <Field label={t("tts.voiceLabel")} validationMessage={voices.length === 0 ? t("tts.noVoices") : undefined}>
            <Select
              searchable
              options={voiceOptions}
              value={form.voice}
              onChange={(voice) => form.set({ voice })}
              placeholder={t("tts.searchVoice")}
            />
          </Field>
        </>
      )}

      <SliderField
        label={t("tts.rate")}
        value={form.rate[form.engine]}
        min={rateCfg.min}
        max={rateCfg.max}
        step={rateCfg.step}
        format={rateCfg.format ?? ((v: number) => t("tts.wordsPerMinute", { count: v }))}
        onChange={(v) => form.set({ rate: { ...form.rate, [form.engine]: v } })}
      />

      <OutputFolderField value={form.outDir} onChange={(dir) => form.set({ outDir: dir })} />

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
          <Select searchable className={styles.narrowDropdown} options={formatOptions(FORMATS)} value={form.format} onChange={setFormat} />
        </Field>
      </div>
    </Panel>
  );

  return (
    <ToolPage toolId="tts">
      <Columns side={voicePanel}>
        <Panel title={t("tts.text")}>
          <Textarea
            {...{ [DROP_ZONE_ATTR]: "" }}
            className={mergeClasses(styles.textarea, dropOver && styles.dropOver)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropOver(true);
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropOver(false);
              claimDrop(e, (paths) => loadTextFile(paths[0]));
            }}
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

        {form.lastOutput && (
          <Panel
            title={t("tts.preview")}
            actions={
              <>
                <Button appearance="subtle" icon={<FolderOpen16Regular />} onClick={() => reveal(form.lastOutput!)}>
                  {t("common.showInFolder")}
                </Button>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Dismiss16Regular />}
                  onClick={() => form.set({ audioSrc: null, lastOutput: null })}
                  aria-label={t("common.clear")}
                />
              </>
            }
          >
            {form.audioSrc ? <AudioPlayer src={form.audioSrc} autoPlay={autoPlay} /> : <Caption1 className={styles.muted}>{form.lastOutput}</Caption1>}
          </Panel>
        )}
      </Columns>

      <ActionBar
        job={runner.running ? runner.job : undefined}
        idleText={form.text.trim() ? t("tts.idle.ready", { voice: voices?.find((v) => v.id === form.voice)?.name ?? "—" }) : t("tts.idle.empty")}
        onCancel={runner.cancel}
      >
        <Button appearance="primary" icon={<Speaker216Filled />} disabled={!canStart} onClick={start}>
          {t("tts.generate")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

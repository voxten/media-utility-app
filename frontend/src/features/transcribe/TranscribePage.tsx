import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Caption1, Field, makeStyles, Switch, Text, tokens } from "@fluentui/react-components";
import { ClosedCaption24Regular, Copy16Regular, DocumentArrowLeft16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../../components/ActionBar";
import { DropZone } from "../../components/DropZone";
import { ModelBanner } from "../../components/ModelBanner";
import { useNotify } from "../../components/notify";
import { Columns } from "../../components/Columns";
import { ToolPage } from "../../components/Page";
import { Panel } from "../../components/Panel";
import { ResultCard } from "../../components/ResultCard";
import { Select } from "../../components/Select";
import { api } from "../../lib/bridge";
import { allFilesFilter, AUDIO_EXTENSIONS, dialogFilter, formatList, formatName, VIDEO_EXTENSIONS } from "../../lib/fileTypes";
import { formatBytes, formatDuration } from "../../lib/format";
import type { TranscribeOptions, TranscribeResult, TranscriptFormat, VideoInfo, WhisperModelInfo } from "../../lib/types";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { useJobRunner } from "../../lib/useJobRunner";
import { useSettings } from "../../stores/settings";
import { languageOptions } from "./languages";

const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const FORMATS: TranscriptFormat[] = ["srt", "vtt", "txt"];
const DEFAULTS: TranscribeOptions = { model: "small", language: "", format: "srt", translate: false };

const useStyles = makeStyles({
  meta: { display: "flex", gap: "12px", flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px 24px", alignItems: "end" },
  transcript: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "360px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  line: { display: "grid", gridTemplateColumns: "56px 1fr", gap: "12px" },
  time: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
});

export default function TranscribePage() {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();
  const stored = useSettings((s) => s.settings?.transcribe);
  const updateSettings = useSettings((s) => s.update);

  const [media, setMedia] = useState<VideoInfo | null>(null);
  const [models, setModels] = useState<WhisperModelInfo[]>([]);
  const [options, setOptions] = useState<TranscribeOptions>(() => ({ ...DEFAULTS, ...stored }));

  const job = useJobRunner<TranscribeResult>("transcribe", {
    onError: (err) => notify.error(t("transcribe.errors.run"), { body: err }),
  });

  const refreshModels = useCallback(() => {
    api.transcribe.models().then(setModels).catch(() => setModels([]));
  }, []);

  useEffect(refreshModels, [refreshModels]);

  const model = models.find((m) => m.id === options.model);
  const canTranslate = model?.translate ?? false;

  const setOption = (patch: Partial<TranscribeOptions>) => setOptions((prev) => ({ ...prev, ...patch }));

  const load = async (path: string) => {
    try {
      const info = await api.transcribe.probe(path);
      if (!info.hasAudio) throw new Error(t("transcribe.errors.noAudio"));
      job.reset();
      setMedia(info);
    } catch (err) {
      notify.error(t("transcribe.errors.load"), { body: String((err as Error)?.message ?? err) });
    }
  };

  const browse = async () => {
    const [path] = await api.dialogs.openFiles(
      [dialogFilter(t, "videos"), dialogFilter(t, "audio"), allFilesFilter(t)],
      false,
    );
    if (path) load(path);
  };

  useIncomingTransfer("transcribe", (files) => {
    if (files[0]) load(files[0]);
  });

  const languages = useMemo(() => languageOptions(i18n.language, t("transcribe.autoLanguage")), [i18n.language, t]);
  const modelOptions = useMemo(() => models.map((m) => ({ value: m.id, label: t(`transcribe.models.${m.id}`) })), [models, t]);

  const start = async () => {
    if (!media || !model?.ready) return;
    const name = `${media.fileName.replace(/\.[^.]+$/, "")}.${options.format}`;
    const outPath = await api.dialogs.saveFile(name, [`${formatName(options.format)} (*.${options.format})`]);
    if (!outPath) return;
    updateSettings({ transcribe: options }).catch(() => undefined);
    job.start(() =>
      api.transcribe.start({ ...options, translate: options.translate && canTranslate, path: media.path, outPath }),
    );
  };

  const copyText = (result: TranscribeResult) => {
    navigator.clipboard
      ?.writeText(result.segments.map((s) => s.text).join("\n"))
      .then(() => notify.success(t("transcribe.copied")))
      .catch(() => undefined);
  };

  if (!media) {
    return (
      <ToolPage toolId="transcribe">
        <DropZone
          fill
          icon={ClosedCaption24Regular}
          title={t("transcribe.dropTitle")}
          hint={t("transcribe.dropHint", { formats: formatList(MEDIA_EXTENSIONS) })}
          accept={MEDIA_EXTENSIONS}
          onFiles={(files) => files[0] && load(files[0])}
          onBrowse={browse}
        />
      </ToolPage>
    );
  }

  const result = job.result;

  const settingsPanel = (
    <>
      <Panel>
        <Field label={t("transcribe.model")}>
          <Select options={modelOptions} value={options.model} onChange={(m) => setOption({ model: m })} />
        </Field>
        <Field label={t("transcribe.language")}>
          <Select
            searchable
            options={languages}
            value={options.language}
            onChange={(language) => setOption({ language })}
          />
        </Field>
        <Field label={t("common.outputFormat")}>
          <Select
            options={FORMATS.map((f) => ({ value: f, label: formatName(f) }))}
            value={options.format}
            onChange={(format) => setOption({ format })}
          />
        </Field>
        <Switch
          checked={options.translate && canTranslate}
          disabled={!canTranslate}
          label={t("transcribe.translate")}
          onChange={(_, d) => setOption({ translate: d.checked })}
        />
      </Panel>
      {model && !model.ready && (
        <ModelBanner
          key={model.id}
          depId={model.depId}
          title={t("transcribe.modelPromo.title")}
          description={t("transcribe.modelPromo.desc")}
          installLabel={t("transcribe.modelPromo.installBtn", { size: formatBytes(model.size) })}
          readyMessage={t("transcribe.modelPromo.ready")}
          onInstalled={refreshModels}
        />
      )}
    </>
  );

  return (
    <ToolPage toolId="transcribe">
      <Columns side={settingsPanel}>
        <Panel
          title={media.fileName}
          actions={
            <Button appearance="subtle" icon={<DocumentArrowLeft16Regular />} onClick={browse}>
              {t("transcribe.changeFile")}
            </Button>
          }
        >
          <Caption1 className={styles.meta}>
            <span>{formatDuration(media.duration)}</span>
            <span>{formatBytes(media.size)}</span>
          </Caption1>
        </Panel>

        {result && (
          <>
            <ResultCard
              title={t("transcribe.done")}
              detail={t("transcribe.doneDetail", {
                language: languages.find((l) => l.value === result.language)?.label ?? result.language,
                elapsed: formatDuration(result.elapsed),
              })}
              path={result.outPath}
              sourceToolId="transcribe"
            />
            <Panel
              title={t("transcribe.transcript")}
              actions={
                <Button appearance="subtle" icon={<Copy16Regular />} onClick={() => copyText(result)}>
                  {t("common.copy")}
                </Button>
              }
            >
              {result.segments.length === 0 ? (
                <Text>{t("transcribe.noSpeech")}</Text>
              ) : (
                <div className={styles.transcript}>
                  {result.segments.map((segment, index) => (
                    <div key={index} className={styles.line}>
                      <Caption1 className={styles.time}>{formatDuration(segment.start)}</Caption1>
                      <Text>{segment.text}</Text>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}
      </Columns>

      <ActionBar job={job.job?.status === "done" ? undefined : job.job} onCancel={job.cancel}>
        <Button
          appearance="primary"
          icon={<ClosedCaption24Regular />}
          disabled={job.running || !model?.ready}
          onClick={start}
        >
          {t("transcribe.start")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

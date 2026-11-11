// "Subtitles" choice of the Download page; Whisper uses the model and language set in the Transcription tool.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Field, makeStyles } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { ModelBanner } from "../../components/ModelBanner";
import { Select } from "../../components/Select";
import { api } from "../../lib/bridge";
import { formatBytes } from "../../lib/format";
import type { DownloadSubtitles, SubtitleMode, WhisperModelInfo } from "../../lib/types";
import { useSettings } from "../../stores/settings";

const MODES: SubtitleMode[] = ["off", "site", "auto"];
const DEFAULT_MODEL = "small";

const useStyles = makeStyles({
  banner: { gridColumn: "1 / -1" },
});

export function useDownloadSubtitles() {
  const { i18n } = useTranslation();
  const mode = useSettings((s) => s.settings?.downloadSubtitles) ?? "off";
  const transcribe = useSettings((s) => s.settings?.transcribe);
  const updateSettings = useSettings((s) => s.update);
  const [models, setModels] = useState<WhisperModelInfo[]>([]);

  const refreshModels = useCallback(() => {
    api.transcribe.models().then(setModels).catch(() => setModels([]));
  }, []);

  useEffect(() => {
    if (mode === "auto") refreshModels();
  }, [mode, refreshModels]);

  const modelId = transcribe?.model ?? DEFAULT_MODEL;
  const language = transcribe?.language ?? "";

  const params = useMemo<DownloadSubtitles | undefined>(() => {
    if (mode === "off") return undefined;
    const preferred = language || i18n.language.split("-")[0];
    return { mode, languages: Array.from(new Set([preferred, "en"])), model: modelId, language };
  }, [mode, language, i18n.language, modelId]);

  return {
    mode,
    setMode: (next: SubtitleMode) => updateSettings({ downloadSubtitles: next }).catch(() => undefined),
    params,
    model: models.find((m) => m.id === modelId),
    refreshModels,
  };
}

export function SubtitlesField({ subtitles }: { subtitles: ReturnType<typeof useDownloadSubtitles> }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { mode, setMode, model, refreshModels } = subtitles;

  return (
    <>
      <Field label={t("download.subtitles.label")}>
        <Select
          options={MODES.map((m) => ({ value: m, label: t(`download.subtitles.${m}`) }))}
          value={mode}
          onChange={setMode}
        />
      </Field>
      {mode === "auto" && model && !model.ready && (
        <div className={styles.banner}>
          <ModelBanner
            key={model.id}
            depId={model.depId}
            title={t("transcribe.modelPromo.title")}
            description={t("download.subtitles.modelHint", { model: model.id.charAt(0).toUpperCase() + model.id.slice(1) })}
            installLabel={t("transcribe.modelPromo.installBtn", { size: formatBytes(model.size) })}
            readyMessage={t("transcribe.modelPromo.ready")}
            onInstalled={refreshModels}
          />
        </div>
      )}
    </>
  );
}

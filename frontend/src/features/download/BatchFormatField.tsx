// What queued links and playlists download: video up to a quality, or audio in a chosen format.

import { Field, Switch } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { Select } from "../../components/Select";
import { formatOptions } from "../../lib/fileTypes";
import { useSettings } from "../../stores/settings";
import { useDownloadForm } from "./store";
import { AUDIO_CODECS, type BatchMode } from "./types";

const MAX_HEIGHTS = [0, 2160, 1440, 1080, 720, 480];

export function BatchFormatField() {
  const { t } = useTranslation();
  const batchMode = useDownloadForm((s) => s.batchMode);
  const maxHeight = useDownloadForm((s) => s.maxHeight);
  const audioCodec = useDownloadForm((s) => s.audioCodec);
  const set = useDownloadForm((s) => s.set);
  const skipArchived = useSettings((s) => s.settings?.downloadSkipArchived ?? false);
  const updateSettings = useSettings((s) => s.update);

  return (
    <>
      <Field label={t("download.batchFormat.mode")}>
        <Select<BatchMode>
          options={[
            { value: "video", label: t("download.modeVideo") },
            { value: "audio", label: t("download.modeAudio") },
          ]}
          value={batchMode}
          onChange={(next) => set({ batchMode: next })}
        />
      </Field>
      {batchMode === "video" ? (
        <Field label={t("download.batchFormat.quality")}>
          <Select
            options={MAX_HEIGHTS.map((h) => ({ value: String(h), label: h ? `${h}p` : t("download.batchFormat.best") }))}
            value={String(maxHeight)}
            onChange={(next) => set({ maxHeight: Number(next) })}
          />
        </Field>
      ) : (
        <Field label={t("download.audioCodec")}>
          <Select options={formatOptions(AUDIO_CODECS)} value={audioCodec} onChange={(next) => set({ audioCodec: next })} />
        </Field>
      )}
      <Switch
        checked={skipArchived}
        label={t("download.skipArchived")}
        onChange={(_, d) => updateSettings({ downloadSkipArchived: d.checked }).catch(() => undefined)}
      />
    </>
  );
}

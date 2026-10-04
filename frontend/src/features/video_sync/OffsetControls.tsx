import { useMemo, useState } from "react";
import {
  Button,
  Caption1,
  Dropdown,
  Field,
  Input,
  makeStyles,
  Option,
  Slider,
  Subtitle2,
  Tab,
  TabList,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  FolderOpen16Regular,
  MusicNote224Regular,
  Speaker224Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { AudioSourceMode } from "./types";
import type { VideoInfo } from "../../lib/types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "16px",
  },
  readoutCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    gap: "4px",
  },
  digitalReadout: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "32px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    transitionProperty: "color",
    transitionDuration: tokens.durationNormal,
  },
  zeroReadout: {
    color: tokens.colorNeutralForeground1,
  },
  delayedReadout: {
    color: "#eab308", // Yellow / amber for delay
  },
  advancedReadout: {
    color: "#38bdf8", // Sky blue for lead
  },
  msReadout: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "14px",
    color: tokens.colorNeutralForeground3,
  },
  nudgeGroup: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "6px",
  },
  nudgeBtn: {
    paddingInline: "4px",
    fontSize: "12px",
  },
  sliderRow: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  sliderLabels: {
    display: "flex",
    justifyContent: "space-between",
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
  },
  inputRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  sectionDivider: {
    height: "1px",
    backgroundColor: tokens.colorNeutralStroke3,
    marginBlock: "4px",
  },
  audioSources: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  externalFileRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
});

interface OffsetControlsProps {
  offsetSec: number;
  onOffsetChange: (offset: number) => void;
  video: VideoInfo;
  selectedAudioTrackIndex: number;
  onAudioTrackChange: (trackIdx: number) => void;
  audioSourceMode: AudioSourceMode;
  onAudioSourceModeChange: (mode: AudioSourceMode) => void;
  externalAudio: VideoInfo | null;
  onPickExternalAudio: () => void;
}

export function OffsetControls({
  offsetSec,
  onOffsetChange,
  video,
  selectedAudioTrackIndex,
  onAudioTrackChange,
  audioSourceMode,
  onAudioSourceModeChange,
  externalAudio,
  onPickExternalAudio,
}: OffsetControlsProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  const [extendedRange, setExtendedRange] = useState<boolean>(false);
  const maxRange = extendedRange ? 30.0 : 5.0;

  const readoutClass = useMemo(() => {
    if (Math.abs(offsetSec) < 0.001) return styles.zeroReadout;
    return offsetSec > 0 ? styles.delayedReadout : styles.advancedReadout;
  }, [offsetSec, styles]);

  const offsetMs = Math.round(offsetSec * 1000);

  const handleNudge = (deltaSec: number) => {
    const updated = Math.round((offsetSec + deltaSec) * 1000) / 1000;
    onOffsetChange(Math.max(-60, Math.min(60, updated)));
  };

  const handleManualSecChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed)) {
      onOffsetChange(Math.max(-60, Math.min(60, Math.round(parsed * 1000) / 1000)));
    }
  };

  const handleManualMsChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed)) {
      onOffsetChange(Math.max(-60, Math.min(60, Math.round(parsed) / 1000)));
    }
  };

  return (
    <div className={styles.container}>
      <Subtitle2>{t("video_sync.controls.title", "Przesunięcie i Synchronizacja Ścieżki")}</Subtitle2>

      {/* Digital Readout Card */}
      <div className={styles.readoutCard}>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          {t("video_sync.controls.currentOffset", "Wartość przesunięcia (Audio Delay / Lead)")}
        </Caption1>
        <div className={`${styles.digitalReadout} ${readoutClass}`}>
          {offsetSec >= 0 ? `+${offsetSec.toFixed(3)} s` : `${offsetSec.toFixed(3)} s`}
        </div>
        <div className={styles.msReadout}>
          {offsetMs >= 0 ? `+${offsetMs} ms` : `${offsetMs} ms`}
        </div>
        <Caption1 style={{ color: tokens.colorNeutralForeground3, textAlign: "center", marginTop: "4px" }}>
          {Math.abs(offsetSec) < 0.001
            ? t("video_sync.status.synced", "Ścieżki są idealnie w fazie zerowej")
            : offsetSec > 0
              ? t("video_sync.status.delayed", "Dźwięk opóźniony (rozbrzmiewa później niż obraz)")
              : t("video_sync.status.early", "Dźwięk wyprzedza obraz (rozbrzmiewa wcześniej)")}
        </Caption1>
      </div>

      {/* Quick Precision Nudge Buttons */}
      <div className={styles.nudgeGroup}>
        <Tooltip content={t("video_sync.nudge.sub1s", "Odejmij 1 sekundę")} relationship="label">
          <Button size="small" appearance="secondary" className={styles.nudgeBtn} onClick={() => handleNudge(-1.0)}>
            -1.0s
          </Button>
        </Tooltip>
        <Tooltip content={t("video_sync.nudge.sub250ms", "Odejmij 250 milisekund")} relationship="label">
          <Button size="small" appearance="secondary" className={styles.nudgeBtn} onClick={() => handleNudge(-0.25)}>
            -250ms
          </Button>
        </Tooltip>
        <Tooltip content={t("video_sync.nudge.sub50ms", "Odejmij 50 milisekund")} relationship="label">
          <Button size="small" appearance="secondary" className={styles.nudgeBtn} onClick={() => handleNudge(-0.05)}>
            -50ms
          </Button>
        </Tooltip>
        <Tooltip content={t("video_sync.nudge.zero", "Zresetuj do 0")} relationship="label">
          <Button size="small" appearance="primary" className={styles.nudgeBtn} onClick={() => onOffsetChange(0)}>
            0.0s
          </Button>
        </Tooltip>
        <Tooltip content={t("video_sync.nudge.add50ms", "Dodaj 50 milisekund")} relationship="label">
          <Button size="small" appearance="secondary" className={styles.nudgeBtn} onClick={() => handleNudge(0.05)}>
            +50ms
          </Button>
        </Tooltip>
        <Tooltip content={t("video_sync.nudge.add250ms", "Dodaj 250 milisekund")} relationship="label">
          <Button size="small" appearance="secondary" className={styles.nudgeBtn} onClick={() => handleNudge(0.25)}>
            +250ms
          </Button>
        </Tooltip>
        <Tooltip content={t("video_sync.nudge.add1s", "Dodaj 1 sekundę")} relationship="label">
          <Button size="small" appearance="secondary" className={styles.nudgeBtn} onClick={() => handleNudge(1.0)}>
            +1.0s
          </Button>
        </Tooltip>
      </div>

      {/* Slider */}
      <div className={styles.sliderRow}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Caption1 style={{ fontWeight: 600 }}>{t("video_sync.slider.label", "Suwak przesunięcia")}</Caption1>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => setExtendedRange((r) => !r)}
            style={{ fontSize: "11px", height: "20px" }}
          >
            {extendedRange
              ? t("video_sync.slider.rangeWide", "Zakres: ±30s")
              : t("video_sync.slider.rangeFine", "Zakres: ±5s (precyzyjny)")}
          </Button>
        </div>
        <Slider
          min={-maxRange}
          max={maxRange}
          step={0.01}
          value={offsetSec}
          onChange={(_, data) => onOffsetChange(data.value)}
        />
        <div className={styles.sliderLabels}>
          <span>-{maxRange}s</span>
          <span>0.0s</span>
          <span>+{maxRange}s</span>
        </div>
      </div>

      {/* Exact Numeric Inputs */}
      <div className={styles.inputRow}>
        <Field label={t("video_sync.input.seconds", "Wpisz w sekundach (s)")}>
          <Input
            type="number"
            step="0.001"
            value={offsetSec.toString()}
            onChange={(_, d) => handleManualSecChange(d.value)}
          />
        </Field>
        <Field label={t("video_sync.input.millis", "Wpisz w milisekundach (ms)")}>
          <Input
            type="number"
            step="1"
            value={offsetMs.toString()}
            onChange={(_, d) => handleManualMsChange(d.value)}
          />
        </Field>
      </div>

      <div className={styles.sectionDivider} />

      {/* Audio Source & Tracks Configuration */}
      <div className={styles.audioSources}>
        <Caption1 style={{ fontWeight: 600 }}>{t("video_sync.sources.title", "Źródło dźwięku do synchronizacji")}</Caption1>
        <TabList
          selectedValue={audioSourceMode}
          onTabSelect={(_, data) => onAudioSourceModeChange(data.value as AudioSourceMode)}
        >
          <Tab value="embedded" icon={<Speaker224Regular />}>
            {t("video_sync.sources.embedded", "Ścieżka z pliku wideo")}
          </Tab>
          <Tab value="external" icon={<MusicNote224Regular />}>
            {t("video_sync.sources.external", "Zewnętrzny plik audio")}
          </Tab>
        </TabList>

        {audioSourceMode === "embedded" && video.audioTracks.length > 0 && (
          <Field label={t("video_sync.tracks.select", "Wybierz ścieżkę dźwiękową z wideo")}>
            <Dropdown
              value={
                video.audioTracks[selectedAudioTrackIndex]?.title ||
                `${t("video_sync.tracks.trackNum", { num: selectedAudioTrackIndex + 1, defaultValue: "Ścieżka {{num}}" })} (${video.audioTracks[selectedAudioTrackIndex]?.codec})`
              }
              onOptionSelect={(_, data) => onAudioTrackChange(Number(data.optionValue || 0))}
            >
              {video.audioTracks.map((tr, idx) => (
                <Option
                  key={tr.streamIndex}
                  value={idx.toString()}
                  text={`${tr.title} • ${tr.codec.toUpperCase()} • ${tr.channels}ch`}
                >
                  {tr.title} • {tr.codec.toUpperCase()} • {tr.channels}ch • {tr.sampleRate}Hz
                </Option>
              ))}
            </Dropdown>
          </Field>
        )}

        {audioSourceMode === "external" && (
          <div className={styles.externalFileRow}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <Caption1 style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {externalAudio ? externalAudio.fileName : t("video_sync.sources.noExternal", "Nie wybrano pliku audio")}
              </Caption1>
              {externalAudio && (
                <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                  {externalAudio.format.toUpperCase()} • {externalAudio.duration.toFixed(1)}s
                </Caption1>
              )}
            </div>
            <Button size="small" icon={<FolderOpen16Regular />} onClick={onPickExternalAudio}>
              {externalAudio ? t("video_sync.sources.changeAudio", "Zmień") : t("video_sync.sources.pickAudio", "Wybierz audio")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

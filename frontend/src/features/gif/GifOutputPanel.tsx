import { Field, Input, makeStyles, Switch } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { ModelBanner } from "../../components/ModelBanner";
import { Panel } from "../../components/Panel";
import { Select } from "../../components/Select";
import { SliderField } from "../../components/SliderField";
import { formatOptions } from "../../lib/fileTypes";
import { formatBytes } from "../../lib/format";
import type { GifOutput } from "./useGifOutput";

const MB = 1024 * 1024;
const SIZE_PRESETS = [256 * 1024, MB, 5 * MB, 8 * MB, 10 * MB, 25 * MB];
const PLAYS = [0, 1, 2, 3, 5];

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px 24px", alignItems: "end" },
  sizeRow: { display: "flex", gap: "8px" },
  sizeInput: { width: "110px" },
});

interface GifOutputPanelProps {
  output: GifOutput;
  onGifsicleInstalled: () => void;
}

export function GifOutputPanel({ output, onGifsicleInstalled }: GifOutputPanelProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { output: value, update, canLimitSize, gifsicle, formats } = output;
  const isGif = value.format === "gif";
  const custom = value.targetBytes > 0 && !SIZE_PRESETS.includes(value.targetBytes);

  const sizeOptions = [
    { value: "0", label: t("gif.output.noLimit") },
    ...SIZE_PRESETS.map((bytes) => ({ value: String(bytes), label: formatBytes(bytes, 0) })),
    { value: "custom", label: t("gif.output.customSize") },
  ];

  return (
    <Panel title={t("gif.output.title")}>
      {isGif && !gifsicle && (
        <ModelBanner
          depId="gifsicle"
          title={t("gif.gifsicle.title")}
          description={t("gif.gifsicle.description")}
          installLabel={t("gif.gifsicle.install")}
          readyMessage={t("gif.gifsicle.ready")}
          onInstalled={onGifsicleInstalled}
        />
      )}
      <div className={styles.grid}>
        <Field label={t("common.outputFormat")}>
          <Select options={formatOptions(formats)} value={value.format} onChange={(format) => update({ format })} />
        </Field>
        {isGif ? (
          <>
            <SliderField label={t("gif.output.colors")} value={value.colors} min={8} max={256} step={8} onChange={(colors) => update({ colors })} />
            <SliderField
              label={t("gif.output.lossy")}
              value={gifsicle ? value.lossy : 0}
              min={0}
              max={200}
              step={10}
              disabled={!gifsicle}
              onChange={(lossy) => update({ lossy })}
            />
            <Switch checked={value.dither} label={t("gif.output.dither")} onChange={(_, d) => update({ dither: d.checked })} />
          </>
        ) : (
          value.format !== "apng" && (
            <SliderField label={t("gif.output.quality")} value={value.quality} min={20} max={100} format={(v) => `${v}%`} onChange={(quality) => update({ quality })} />
          )
        )}
        {value.format !== "mp4" && (
          <Field label={t("gif.output.plays")}>
            <Select
              options={PLAYS.map((plays) => ({ value: String(plays), label: plays === 0 ? t("gif.output.forever") : t("gif.output.playsCount", { count: plays }) }))}
              value={String(value.plays)}
              onChange={(plays) => update({ plays: Number(plays) })}
            />
          </Field>
        )}
        <Field label={t("gif.output.sizeLimit")}>
          <div className={styles.sizeRow}>
            <Select
              options={sizeOptions}
              value={custom ? "custom" : String(canLimitSize ? value.targetBytes : 0)}
              disabled={!canLimitSize}
              onChange={(choice) => update({ targetBytes: choice === "custom" ? 2 * MB : Number(choice) })}
            />
            {custom && canLimitSize && (
              <Input
                className={styles.sizeInput}
                type="number"
                min={0.05}
                step={0.5}
                contentAfter="MB"
                value={String(Math.round((value.targetBytes / MB) * 100) / 100)}
                onChange={(_, d) => update({ targetBytes: Math.max(1, Math.round(Number(d.value) * MB)) })}
              />
            )}
          </div>
        </Field>
      </div>
    </Panel>
  );
}

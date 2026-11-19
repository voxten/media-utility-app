import { Caption1, Field, Input, makeStyles, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { formatDuration } from "../../lib/format";

const useStyles = makeStyles({
  row: { display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" },
  time: { width: "130px" },
  length: { color: tokens.colorNeutralForeground3 },
});

const round = (sec: number) => Math.round(sec * 100) / 100;

interface TrimFieldsProps {
  start: number;
  end: number;
  duration: number;
  onChange: (start: number, end: number) => void;
  minLength?: number;
  /** Length of the output when it differs from the range (e.g. after a speed change). */
  outputSeconds?: number;
}

/** Start and end of a trim range typed in seconds, next to a TrimTimeline. */
export function TrimFields({ start, end, duration, onChange, minLength = 0.1, outputSeconds = end - start }: TrimFieldsProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  return (
    <div className={styles.row}>
      <Field label={t("common.trimStart")} className={styles.time}>
        <Input
          type="number"
          step={0.1}
          min={0}
          contentAfter="s"
          value={String(round(start))}
          onChange={(_, d) => onChange(Math.max(0, Math.min(end - minLength, Number(d.value) || 0)), end)}
        />
      </Field>
      <Field label={t("common.trimEnd")} className={styles.time}>
        <Input
          type="number"
          step={0.1}
          min={0}
          max={round(duration)}
          contentAfter="s"
          value={String(round(end))}
          onChange={(_, d) => onChange(start, Math.min(duration, Math.max(start + minLength, Number(d.value) || 0)))}
        />
      </Field>
      <Caption1 className={styles.length}>{t("common.trimLength", { duration: formatDuration(outputSeconds) })}</Caption1>
    </div>
  );
}

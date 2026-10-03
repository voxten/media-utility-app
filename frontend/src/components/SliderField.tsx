import { Caption1, Field, makeStyles, Slider, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", gap: "12px" },
  slider: { flexGrow: 1 },
  value: {
    minWidth: "40px",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontWeight: tokens.fontWeightSemibold,
  },
  hint: { color: tokens.colorNeutralForeground3 },
});

interface SliderFieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export function SliderField({ label, hint, value, min, max, step = 1, disabled, format, onChange }: SliderFieldProps) {
  const styles = useStyles();
  return (
    <Field label={label} hint={hint ? <Caption1 className={styles.hint}>{hint}</Caption1> : undefined}>
      <div className={styles.row}>
        <Slider
          className={styles.slider}
          value={value}
          min={min}
          max={max}
          // Fluent draws a mark per step; only useful for short ranges.
          step={(max - min) / step <= 20 ? step : undefined}
          disabled={disabled}
          onChange={(_, data) => onChange(data.value)}
        />
        <span className={styles.value}>{format ? format(value) : value}</span>
      </div>
    </Field>
  );
}

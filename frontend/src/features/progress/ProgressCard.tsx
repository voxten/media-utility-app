// The exported graphic. Plain inline styles (no Fluent tokens) so html-to-image renders it
// identically regardless of the app theme. Port of features/progress_generator/style.css.

import { forwardRef } from "react";

export interface ProgressRow {
  id: string;
  name: string;
  /** Percent (0–100) or, in "count" mode, the amount done out of `total`. */
  value: number;
  total: number;
  from: string;
  to: string;
}

export type ValueMode = "percent" | "count";

export interface CardOptions {
  title: string;
  banner: string | null;
  width: number;
  barHeight: number;
  rounded: boolean;
  theme: "dark" | "light";
  valueMode: ValueMode;
  showValue: boolean;
}

/** How full the bar is, 0–100. */
export function rowPercent(row: ProgressRow, mode: ValueMode): number {
  const percent = mode === "count" ? (row.total > 0 ? (row.value / row.total) * 100 : 0) : row.value;
  return Math.max(0, Math.min(100, percent));
}

const THEMES = {
  dark: { card: "#222222", border: "#111111", track: "#2d2d2d", text: "#ffffff", title: "#ffffff" },
  light: { card: "#f6f6f8", border: "#dedee3", track: "#e3e3e8", text: "#ffffff", title: "#1d1d22" },
};

export const ProgressCard = forwardRef<HTMLDivElement, { rows: ProgressRow[]; options: CardOptions }>(function ProgressCard({ rows, options }, ref) {
  const theme = THEMES[options.theme];
  const radius = options.rounded ? 12 : 0;
  const rowRadius = options.rounded ? 8 : 0;
  return (
    <div
      ref={ref}
      style={{
        width: options.width,
        background: theme.card,
        border: `3px solid ${theme.border}`,
        borderRadius: radius,
        overflow: "hidden",
        fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {options.banner && <img src={options.banner} alt="" style={{ width: "100%", display: "block" }} />}
      {options.title && (
        <div style={{ padding: "18px 18px 10px", fontSize: 26, fontWeight: 800, color: theme.title, letterSpacing: 0.2 }}>{options.title}</div>
      )}
      <div style={{ padding: options.rounded ? 10 : 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{ position: "relative", height: options.barHeight, background: theme.track, borderRadius: rowRadius, overflow: "hidden" }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${rowPercent(row, options.valueMode)}%`,
                background: `linear-gradient(90deg, ${row.from}, ${row.to})`,
                transition: "width 0.4s ease",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 2,
                height: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 18px",
                fontSize: Math.round(options.barHeight * 0.38),
                fontWeight: 700,
                color: theme.text,
                textShadow: "1px 1px 3px rgba(0,0,0,0.85)",
              }}
            >
              <span>{row.name}</span>
              {options.showValue && <span>{options.valueMode === "count" ? `${row.value}/${row.total}` : `${row.value}%`}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

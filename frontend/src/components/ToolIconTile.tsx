import type { ComponentType } from "react";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  tile: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    color: tokens.colorNeutralForegroundStaticInverted,
  },
  small: {
    width: "32px",
    height: "32px",
    borderRadius: tokens.borderRadiusMedium,
    "& svg": { width: "18px", height: "18px" },
  },
  large: {
    width: "40px",
    height: "40px",
    borderRadius: tokens.borderRadiusLarge,
    "& svg": { width: "22px", height: "22px" },
  },
  plain: { color: tokens.colorNeutralForeground2, backgroundColor: tokens.colorNeutralBackground3 },
});

/** The gradient is the tool's own accent colour, so it stays an inline style; color-mix also accepts CSS variables. */
export const accentGradient = (accent: string) =>
  `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 73%, transparent))`;

interface ToolIconTileProps {
  icon: ComponentType;
  /** Tool accent colour; without it the tile is neutral. */
  accent?: string;
  size?: "small" | "large";
  className?: string;
}

export function ToolIconTile({ icon: Icon, accent, size = "small", className }: ToolIconTileProps) {
  const styles = useStyles();
  return (
    <span
      className={mergeClasses(styles.tile, styles[size], !accent && styles.plain, className)}
      style={accent ? { background: accentGradient(accent) } : undefined}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

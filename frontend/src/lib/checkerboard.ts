import { tokens, type GriffelStyle } from "@fluentui/react-components";

/** Transparency checkerboard drawn with theme tokens; `cell` is the square size in px. */
export function checkerboard(cell = 10): GriffelStyle {
  const c = tokens.colorNeutralBackground4;
  return {
    backgroundColor: tokens.colorNeutralBackground3,
    backgroundImage: `linear-gradient(45deg, ${c} 25%, transparent 25%), linear-gradient(-45deg, ${c} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${c} 75%), linear-gradient(-45deg, transparent 75%, ${c} 75%)`,
    backgroundSize: `${cell * 2}px ${cell * 2}px`,
    backgroundPosition: `0 0, 0 ${cell}px, ${cell}px -${cell}px, -${cell}px 0`,
  };
}

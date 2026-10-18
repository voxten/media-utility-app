import { tokens } from "@fluentui/react-components";

/** Colours that tell page groups apart: source files in the merger, output ranges in the splitter. */
export const GROUP_COLORS = [
  tokens.colorPaletteBlueBorderActive,
  tokens.colorPaletteDarkOrangeBorderActive,
  tokens.colorPaletteTealBorderActive,
  tokens.colorPalettePurpleBorderActive,
  tokens.colorPaletteMarigoldBorderActive,
  tokens.colorPaletteCranberryBorderActive,
  tokens.colorPaletteForestBorderActive,
  tokens.colorPaletteAnchorBorderActive,
];

export const groupColor = (index: number) => GROUP_COLORS[index % GROUP_COLORS.length];

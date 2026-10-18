import { tokens } from "@fluentui/react-components";

/**
 * Colours for chrome drawn on top of user images (labels, sliders, brush cursors).
 * They stay the same in light and dark themes because the backdrop is the picture, not the app.
 */
export const ON_IMAGE = {
  scrim: "rgba(0, 0, 0, 0.6)",
  light: tokens.colorNeutralForegroundStaticInverted,
  dark: tokens.colorNeutralForeground1Static,
  hover: "rgba(255, 255, 255, 0.15)",
  selected: "rgba(255, 255, 255, 0.25)",
  outline: "rgba(0, 0, 0, 0.6)",
  /** Paper behind PDF page renders, which have no background of their own. */
  paper: "#ffffff",
} as const;

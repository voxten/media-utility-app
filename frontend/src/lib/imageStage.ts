// Size of the preview area in image tools, shared so the stage and the comparison inside it line up.

export const IMAGE_STAGE_HEIGHT = "min(64vh, 660px)";
export const IMAGE_STAGE_PADDING = "16px";
/** Largest height an image may take inside the stage. */
export const IMAGE_STAGE_CONTENT_HEIGHT = `calc(${IMAGE_STAGE_HEIGHT} - 2 * ${IMAGE_STAGE_PADDING})`;

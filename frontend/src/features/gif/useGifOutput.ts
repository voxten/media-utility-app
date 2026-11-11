import { useCallback, useMemo } from "react";
import { create } from "zustand";
import type { GifFormat, GifOutputOptions } from "../../lib/types";
import { useSettings } from "../../stores/settings";

export const GIF_FORMAT_EXTENSIONS: Record<GifFormat, string> = { gif: ".gif", webp: ".webp", apng: ".png", mp4: ".mp4" };

const DEFAULT_OUTPUT: GifOutputOptions = {
  format: "gif",
  lossy: 0,
  colors: 256,
  dither: true,
  plays: 0,
  quality: 80,
  targetBytes: 0,
};

/** Output settings per GIF tool, kept across page switches. */
const useGifOutputs = create<{ byTool: Record<string, GifOutputOptions> }>(() => ({ byTool: {} }));

/** Output settings shared by the GIF tools; the last used ones are kept in the app settings. */
export function useGifOutput(toolId: string, formats: readonly GifFormat[], gifsicle: boolean) {
  const stored = useSettings((s) => s.settings?.gifOutput);
  const updateSettings = useSettings((s) => s.update);
  const kept = useGifOutputs((s) => s.byTool[toolId]);
  const output = useMemo<GifOutputOptions>(() => {
    if (kept) return kept;
    const initial = { ...DEFAULT_OUTPUT, ...stored };
    return formats.includes(initial.format) ? initial : { ...initial, format: formats[0] };
  }, [kept, stored, formats]);

  const update = useCallback(
    (patch: Partial<GifOutputOptions>) =>
      useGifOutputs.setState((s) => ({ byTool: { ...s.byTool, [toolId]: { ...output, ...s.byTool[toolId], ...patch } } })),
    [toolId, output],
  );

  const canLimitSize = output.format !== "apng" && (output.format !== "gif" || gifsicle);
  const params = useMemo<GifOutputOptions>(
    () => ({
      ...output,
      lossy: gifsicle ? output.lossy : 0,
      targetBytes: canLimitSize ? output.targetBytes : 0,
    }),
    [output, gifsicle, canLimitSize],
  );

  const remember = useCallback(() => {
    updateSettings({ gifOutput: output }).catch(() => undefined);
  }, [output, updateSettings]);

  return { output, update, params, canLimitSize, gifsicle, formats, extension: GIF_FORMAT_EXTENSIONS[output.format], remember };
}

export type GifOutput = ReturnType<typeof useGifOutput>;

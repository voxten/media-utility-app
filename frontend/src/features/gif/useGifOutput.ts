import { useCallback, useMemo, useState } from "react";
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

/** Output settings shared by the GIF tools; the last used ones are kept in the app settings. */
export function useGifOutput(formats: readonly GifFormat[], gifsicle: boolean) {
  const stored = useSettings((s) => s.settings?.gifOutput);
  const updateSettings = useSettings((s) => s.update);
  const [output, setOutput] = useState<GifOutputOptions>(() => {
    const initial = { ...DEFAULT_OUTPUT, ...stored };
    return formats.includes(initial.format) ? initial : { ...initial, format: formats[0] };
  });

  const update = useCallback((patch: Partial<GifOutputOptions>) => setOutput((prev) => ({ ...prev, ...patch })), []);

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

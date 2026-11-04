import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import type { LoadFrames } from "../../components/timeline/timelineCore";
import type { VideoFrame } from "../../lib/types";

type FetchFrames = (path: string, startSec: number, duration: number, count: number, height: number) => Promise<{ frames: VideoFrame[] }>;

/** Timeline frame loader for `path`; the timeline refetches on every scroll/zoom, so a failure is reported once per file. */
export function useFrameLoader(fetchFrames: FetchFrames, path: string | null): LoadFrames {
  const { t } = useTranslation();
  const notify = useNotify();
  const failedFor = useRef<string | null>(null);

  return useCallback(
    (startSec, duration, count, height) => {
      if (!path) return Promise.resolve([]);
      return fetchFrames(path, startSec, duration, count, height)
        .then((r) => r.frames)
        .catch((err) => {
          if (failedFor.current !== path) {
            failedFor.current = path;
            notify.error(t("gif.errors.frames"), { body: String((err as Error)?.message ?? err) });
          }
          return [];
        });
    },
    [fetchFrames, path, notify, t],
  );
}

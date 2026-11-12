// Offers to install FFmpeg in the tools that cannot work without it, before a task fails on it.

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { api } from "../lib/bridge";
import { ModelBanner } from "./ModelBanner";

interface FfmpegState {
  /** null until the first check finishes. */
  ready: boolean | null;
  check: () => Promise<void>;
}

export const useFfmpeg = create<FfmpegState>((set) => ({
  ready: null,
  check: async () => {
    try {
      const deps = await api.system.dependencies();
      set({ ready: deps.find((d) => d.id === "ffmpeg")?.ok ?? false });
    } catch {
      set({ ready: null });
    }
  },
}));

export function FfmpegBanner() {
  const { t } = useTranslation();
  const ready = useFfmpeg((s) => s.ready);
  const check = useFfmpeg((s) => s.check);

  useEffect(() => {
    if (useFfmpeg.getState().ready !== true) void check();
  }, [check]);

  if (ready !== false) return null;
  return (
    <ModelBanner
      depId="ffmpeg"
      title={t("ffmpegBanner.title")}
      description={t("ffmpegBanner.description")}
      installLabel={t("ffmpegBanner.install")}
      readyMessage={t("ffmpegBanner.ready")}
      onInstalled={check}
    />
  );
}

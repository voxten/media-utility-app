// Video sync state, kept across page switches (including the computed waveforms).

import { create } from "zustand";
import type { VideoInfo, WaveformData } from "../../lib/types";

export type ExportMode = "fast_copy" | "reencode";
/** Index of an embedded audio track, or the external audio file. */
export type AudioSource = number | "external";

interface VideoSyncForm {
  video: VideoInfo | null;
  trackWave: WaveformData | null;
  /** Video path and audio stream the track waveform belongs to. */
  trackWaveKey: string;
  externalAudio: VideoInfo | null;
  externalWave: WaveformData | null;
  source: AudioSource;
  trackIndex: number;
  offsetSec: number;
  previewStartSec: number;
  previewDuration: number;
  previewClip: { url: string; startSec: number } | null;
  /** Folder picked in the tool; "" means the default output folder. */
  outputDir: string;
  outputName: string;
  exportMode: ExportMode;
  set: (patch: Partial<Omit<VideoSyncForm, "set">>) => void;
}

export const useVideoSyncForm = create<VideoSyncForm>((set) => ({
  video: null,
  trackWave: null,
  trackWaveKey: "",
  externalAudio: null,
  externalWave: null,
  source: 0,
  trackIndex: 0,
  offsetSec: 0,
  previewStartSec: 0,
  previewDuration: 30,
  previewClip: null,
  outputDir: "",
  outputName: "",
  exportMode: "fast_copy",
  set: (patch) => set(patch),
}));

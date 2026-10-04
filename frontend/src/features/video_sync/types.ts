import type { VideoInfo } from "../../lib/types";

export type AudioSourceMode = "embedded" | "external";

export interface VideoSyncState {
  video: VideoInfo | null;
  externalAudio: VideoInfo | null;
  audioSourceMode: AudioSourceMode;
  selectedAudioTrackIndex: number;
  offsetSec: number;
  previewStartSec: number;
  previewDuration: number;
  previewUrl: string | null;
  isGeneratingPreview: boolean;
  exportMode: "fast_copy" | "reencode";
  exportFormat: string;
}

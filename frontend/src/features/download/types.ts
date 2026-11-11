export type Mode = "video" | "audio" | "muxed";
export type BatchMode = "video" | "audio";

export const AUDIO_CODECS = ["mp3", "m4a", "flac", "wav", "aac", "opus"];

export interface Format {
  id: string;
  kind: "auto" | "video" | "audio" | "muxed";
  ext: string;
  height: number | null;
  fps: number | null;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  abr?: number | null;
  note: string;
}

export interface PlaylistEntry {
  url: string;
  title: string;
  id: string;
  duration: number | null;
}

export interface ProbeResult {
  url: string;
  title: string;
  uploader: string;
  duration: number | null;
  viewCount: number | null;
  thumbnail: string | null;
  isPlaylist?: boolean;
  photoCount?: number;
  entries?: PlaylistEntry[];
  formats: Record<Mode, Format[]>;
}

export interface BatchItem {
  index: number;
  url: string;
  status: "pending" | "running" | "done" | "error" | "skipped" | "cancelled";
  title?: string;
  error?: string;
  percent?: number;
  size?: number;
  duration?: number;
}

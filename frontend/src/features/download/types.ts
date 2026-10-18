export type Mode = "video" | "audio" | "muxed";

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
  entries?: PlaylistEntry[];
  formats: Record<Mode, Format[]>;
}

export interface BatchItem {
  index: number;
  url: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  title?: string;
  error?: string;
  percent?: number;
  size?: number;
  duration?: number;
}

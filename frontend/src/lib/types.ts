// Shapes shared with the Python backend (backend/bridge/api.py, backend/core/*).

export type ThemePreference = "system" | "light" | "dark";
export type Language = "pl" | "en";

export interface Settings {
  theme: ThemePreference;
  language: Language;
  mica: boolean;
  outputDir: string;
  cookies: { youtube: string; x: string };
  recentFolders: string[];
  hardwareAcceleration: boolean;
  maxConcurrency: number;
  desktopNotifications: boolean;
  completionSound: boolean;
  customFfmpegPath: string;
  confirmExitOnActiveJobs: boolean;
}

export interface StorageInfo {
  appDataDir: string;
  cacheDir: string;
  modelsDir: string;
  binDir: string;
  cacheBytes: number;
  cacheFiles: number;
  modelsBytes: number;
  modelsFiles: number;
  binBytes: number;
  binFiles: number;
  totalAppDataBytes: number;
  totalAppDataFiles: number;
}

export interface ClearCacheResult {
  freedBytes: number;
  filesDeleted: number;
  errors: string[];
  success: boolean;
}

export interface HardwareInfo {
  cpuName: string;
  cpuThreads: number;
  cpuArchitecture: string;
  gpus: string[];
  cudaAvailable: boolean;
  cudaDeviceName: string;
  cudaVersion: string;
  ramTotalBytes: number;
  ramAvailBytes: number;
  osName: string;
}

export interface AppInfo {
  name: string;
  version: string;
  python: string;
  platform: string;
  mica?: boolean;
  micaSupported?: boolean;
}

export interface Dependency {
  id: "ffmpeg" | "mediainfo" | "lama" | string;
  ok: boolean;
  detail: string;
  usedBy: string[];
  required: boolean;
  installable?: boolean;
  sizeEstimate?: string;
}

export type JobStatus = "running" | "done" | "error" | "cancelled";

export interface JobInfo {
  id: string;
  kind: string;
  title: string;
  status: JobStatus;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  percent: number | null;
  message: string | null;
  params: Record<string, unknown>;
}

export interface LogEntry {
  message: string;
  params: Record<string, unknown>;
  level: "info" | "warning" | "error" | string;
  time: number;
}

// Event payloads (Python → JS)
export interface JobProgressEvent {
  jobId: string;
  percent: number | null;
  message: string | null;
  params: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface BridgeEvents {
  "job:started": JobInfo;
  "job:progress": JobProgressEvent;
  "job:log": LogEntry & { jobId: string };
  "job:partial": { jobId: string; data: unknown };
  "job:done": { jobId: string; result: unknown };
  "job:error": { jobId: string; error: string };
  "job:cancelled": { jobId: string };
  "files:dropped": { paths: string[] };
  "app:mica": { active: boolean };
}

export type BridgeEventName = keyof BridgeEvents;

export interface UpscalePreview {
  path: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  dataUrl: string;
}

export interface UpscaleResult {
  resultPath: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  dataUrl: string;
}

export interface UpscaleOptions {
  path: string;
  model: "general" | "anime";
  scale: 2 | 4;
  alphaMode: "smooth" | "ai";
  antiHalo: boolean;
}

export interface RemBgPreview {
  path: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface RemBgResult {
  resultPath: string;
  width: number;
  height: number;
  dataUrl: string;
  elapsed?: number;
}

export interface RemBgOptions {
  path: string;
  model: "birefnet" | "birefnet-lite" | "isnet" | "u2net";
  antiHalo: boolean;
  choke: number;
  feather: number;
  despeckle: boolean;
  userMask?: string;
}

export interface AudioTrackInfo {
  index: number;
  streamIndex: number;
  codec: string;
  channels: number;
  sampleRate: number;
  bitrate: number;
  title: string;
  language: string;
}

export interface VideoInfo {
  path: string;
  fileName: string;
  size: number;
  format: string;
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioTracks: AudioTrackInfo[];
  thumbnail: string;
}

export interface WaveformData {
  points: number[];
  sampleCount: number;
  duration: number;
  startSec: number;
  maxPeak: number;
}

export interface VideoFrame {
  time: number;
  dataUrl: string;
}

export interface SyncPreviewResult {
  previewUrl: string;
  duration: number;
  offsetSec: number;
  startSec: number;
  sizeBytes: number;
}

export interface VideoSyncParams {
  videoPath: string;
  audioPath?: string;
  audioTrackIndex: number;
  offsetSec: number;
  outputPath: string;
  mode: "fast_copy" | "reencode";
}


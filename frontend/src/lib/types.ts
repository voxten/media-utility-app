// Shapes shared with the Python backend (backend/bridge/api.py, backend/core/*).

export type ThemePreference = "system" | "light" | "dark";
export type Language = "pl" | "en";

export interface Settings {
  theme: ThemePreference;
  language: Language;
  mica: boolean;
  outputDir: string;
  cookies: { youtube: string; x: string; instagram: string };
  recentFolders: string[];
  hardwareAcceleration: boolean;
  maxConcurrency: number;
  desktopNotifications: boolean;
  completionSound: boolean;
  customFfmpegPath: string;
  confirmExitOnActiveJobs: boolean;
  /** X hides the window to the notification area; jobs keep running. */
  closeToTray: boolean;
  /** Offer a newly copied video link when the window is activated. */
  clipboardWatch: boolean;
  /** The last link offered, so the same one is not offered twice. */
  clipboardLastLink: string;
  /** App version whose release notes the user was last pointed to; empty on a fresh install. */
  lastSeenVersion: string;
  /** Look for newer download engines at start-up, at most once a day. */
  engineUpdateCheck: boolean;
  /** Unix time (seconds) of the last look. */
  engineLastCheck: number;
  /** Last output settings used by the GIF tools. */
  gifOutput?: GifOutputOptions;
  /** Last options used by the Transcription tool. */
  transcribe?: TranscribeOptions;
  /** Subtitles saved next to downloads. */
  downloadSubtitles?: SubtitleMode;
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

/** Translated texts for the tray menu and native prompts, which the backend cannot translate. */
export interface ShellLabels {
  open: string;
  quit: string;
  backgroundTitle: string;
  backgroundBody: string;
  quitConfirmTitle: string;
  quitConfirmBody: string;
  clipboard: string;
  clipboardEmpty: string;
}

/** A copied link and the download tool that handles it (backend/core/clipboard.py). */
export interface ClipboardLink {
  url: string;
  target: "download" | "instagram";
  /** Every copied video link when there are several; they go to the download queue together. */
  urls?: string[];
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

/** A download engine (yt-dlp, gallery-dl) that can be updated without a new app release. */
export interface EngineInfo {
  id: string;
  /** Version this app instance runs. */
  version: string | null;
  /** Newest version on PyPI at the last check. */
  latest: string | null;
  updateAvailable: boolean;
  /** An update or restore takes effect after a restart. */
  restartRequired: boolean;
  /** The next start uses a downloaded copy instead of the bundled one. */
  downloaded: boolean;
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
  /** What the job works on, sent once known (ctx.describe): thumb, height, ext, length, uploader, site. */
  meta?: JobMeta;
  /** A failed job can be run again with the same settings (api.jobs.retry). */
  retryable?: boolean;
}

export interface JobMeta {
  /** Small data-URL thumbnail shown instead of the tool icon. */
  thumb?: string;
  height?: number;
  ext?: string;
  /** Media length in seconds. */
  length?: number;
  uploader?: string;
  site?: string;
}

/** A finished job kept across restarts (backend/core/history.py). */
export interface HistoryEntry {
  id: string;
  kind: string;
  title: string;
  status: Exclude<JobStatus, "running">;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  /** Files the job wrote, or its output folder. */
  outputs: string[];
  /** Whether the first output still exists. */
  available: boolean;
  /** Whether the job wrote one file (not a folder) that still exists. */
  singleFile?: boolean;
  /** Numbers from the result the job card summarises (backend/core/history.py STAT_KEYS). */
  stats?: Record<string, unknown>;
  meta?: JobMeta;
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
  "job:meta": { jobId: string; meta: JobMeta };
  "job:done": { jobId: string; result: unknown };
  "job:error": { jobId: string; error: string };
  "job:cancelled": { jobId: string };
  "jobs:history": HistoryEntry;
  "clipboard:link": ClipboardLink;
  "files:dropped": { paths: string[] };
  "app:mica": { active: boolean };
  "engines:update": { engines: EngineInfo[] };
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


export type GifFormat = "gif" | "webp" | "apng" | "mp4";

export interface GifOutputOptions {
  format: GifFormat;
  lossy: number;
  colors: number;
  dither: boolean;
  /** Number of plays; 0 loops forever. */
  plays: number;
  quality: number;
  /** 0 keeps the settings as they are; otherwise the result is shrunk until it fits. */
  targetBytes: number;
}

export interface GifFit {
  size: number;
  reached: boolean;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoToGifParams {
  path: string;
  duration: number;
  start: number;
  end: number;
  fps: number;
  /** 0 keeps the source (or cropped) width. */
  width: number;
  speed: number;
  crop: CropArea | null;
  reverse: boolean;
  output: GifOutputOptions;
}

export interface VideoToGifPreview {
  dataUrl: string;
  size: number;
  previewSeconds: number;
  estimatedSize: number;
}

export interface VideoToGifResult {
  outPath: string;
  size: number;
  width: number;
  height: number;
  frames: number;
  duration: number;
  fit: GifFit | null;
}

export type WhisperModelId = "base" | "small" | "turbo";
export type TranscriptFormat = "srt" | "vtt" | "txt";

export interface WhisperModelInfo {
  id: WhisperModelId;
  /** Dependency id passed to `system.install_dependency`. */
  depId: string;
  size: number;
  ready: boolean;
  /** Whether the model can translate speech into English. */
  translate: boolean;
}

/** off, the site's own subtitles, or the site's with Whisper when it has none. */
export type SubtitleMode = "off" | "site" | "auto";

export interface DownloadSubtitles {
  mode: SubtitleMode;
  /** Languages asked from the site, in order of preference. */
  languages: string[];
  model: WhisperModelId;
  /** Spoken language for Whisper; empty detects it. */
  language: string;
}

export interface TranscribeOptions {
  model: WhisperModelId;
  /** ISO 639-1 code; empty detects the language. */
  language: string;
  format: TranscriptFormat;
  translate: boolean;
}

export interface TranscribeParams extends TranscribeOptions {
  path: string;
  outPath: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  outPath: string;
  format: TranscriptFormat;
  language: string;
  duration: number;
  elapsed: number;
  segments: TranscriptSegment[];
}

export interface AnimationInfo {
  path: string;
  fileName: string;
  size: number;
  width: number;
  height: number;
  frames: number;
  duration: number;
  plays: number;
  format: string;
  /** Empty for files too large to show inline. */
  dataUrl: string;
  gifsicle: boolean;
}

export interface GifOperations {
  trim?: { start: number; end: number };
  crop?: CropArea;
  rotate?: number;
  flip_h?: boolean;
  flip_v?: boolean;
  resize?: { percent?: number; width?: number; height?: number };
  speed?: number;
  reverse?: boolean;
  boomerang?: boolean;
}

/** One slide of a post, one story, or one post of a profile (then possibly a carousel of `count` files). */
export interface InstagramItem {
  index: number;
  kind: "image" | "video" | "carousel";
  count: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnail: string | null;
  /** Checked when the link was opened; a story link checks only that story. */
  selected: boolean;
}

export interface InstagramListing {
  url: string;
  kind: "post" | "stories" | "profile";
  uploader: string;
  items: InstagramItem[];
}

export interface InstagramResult {
  files: string[];
  /** Item index of each file in `files`. */
  indices: number[];
  failed: number;
  size: number;
  duration: number;
  outdir: string;
}

export interface GifEditorPreview {
  width: number;
  height: number;
  frames: number;
  duration: number;
  size: number;
  fit: GifFit | null;
  dataUrl: string;
}

export interface GifEditorItem extends Omit<GifEditorPreview, "dataUrl"> {
  file: string;
  dest: string;
  originalSize: number;
  savedPercent: number;
}

export interface GifEditorResult {
  total: number;
  processed: number;
  failed: number;
  inBytes: number;
  outBytes: number;
  savedPercent: number;
  outPath: string;
  outputDir: string;
  files: string[];
  results: GifEditorItem[];
}

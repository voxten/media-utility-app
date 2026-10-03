// Shapes shared with the Python backend (backend/bridge/api.py, backend/core/*).

export type ThemePreference = "system" | "light" | "dark";
export type Language = "pl" | "en";

export interface Settings {
  theme: ThemePreference;
  language: Language;
  outputDir: string;
  cookies: { youtube: string; x: string };
  recentFolders: string[];
}

export interface AppInfo {
  name: string;
  version: string;
  python: string;
  platform: string;
}

export interface Dependency {
  id: "ffmpeg" | "mediainfo" | "lama" | string;
  ok: boolean;
  detail: string;
  usedBy: string[];
  required: boolean;
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
}

export type BridgeEventName = keyof BridgeEvents;

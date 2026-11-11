export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Short local date and time for a Unix timestamp in seconds. */
export function formatDateTime(seconds: number, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" }).format(new Date(seconds * 1000));
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function dirName(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join("\\");
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  return /[\\/]$/.test(dir) ? `${dir}${name}` : `${dir}\\${name}`;
}

/** Short local time (hours and minutes) for a Unix timestamp in seconds. */
export function formatTime(seconds: number, language: string): string {
  return new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(new Date(seconds * 1000));
}

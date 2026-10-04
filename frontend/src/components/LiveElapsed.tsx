import { useEffect, useState } from "react";

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m ${remSec}s`;
}

export function useLiveElapsed(startedAt: number, finishedAt?: number | null, active: boolean = true): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || finishedAt != null) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [active, finishedAt]);

  const endMs = finishedAt != null ? finishedAt * 1000 : now;
  const elapsedSec = Math.max(0, (endMs - startedAt * 1000) / 1000);
  return formatElapsed(elapsedSec);
}

interface LiveElapsedProps {
  startedAt: number;
  finishedAt?: number | null;
  active?: boolean;
  className?: string;
  prefix?: string;
}

export function LiveElapsed({ startedAt, finishedAt, active = true, className, prefix = "" }: LiveElapsedProps) {
  const text = useLiveElapsed(startedAt, finishedAt, active);
  return <span className={className}>{prefix}{text}</span>;
}

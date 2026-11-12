// Small previews for file lists, shared by every component that shows one so each file is decoded once.

import { useEffect, useState } from "react";
import { api } from "./bridge";

export interface Thumbnail {
  width: number;
  height: number;
  /** Format read from the file's contents, e.g. "PNG". */
  format: string;
  size: number;
  dataUrl: string;
}

/** Thumbnails kept in memory; the least recently used ones are decoded again when needed. */
export const CACHE_SIZE = 300;
/** Decoded at once, so a folder of 500 photos does not flood the backend with 500 requests. */
export const MAX_PARALLEL = 4;

const cache = new Map<string, Promise<Thumbnail | null>>();
const waiting: Array<() => void> = [];
let active = 0;

function runQueued<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
    };
    if (active < MAX_PARALLEL) run();
    else waiting.push(run);
  });
}

export function loadThumbnail(path: string): Promise<Thumbnail | null> {
  let pending = cache.get(path);
  if (pending) {
    cache.delete(path);
    cache.set(path, pending);
    return pending;
  }
  // A failure is not cached: the file may still be being written, so the next view retries.
  pending = runQueued(() => api.image_editor.thumbnail(path)).catch(() => {
    cache.delete(path);
    return null;
  });
  cache.set(path, pending);
  for (const oldest of cache.keys()) {
    if (cache.size <= CACHE_SIZE) break;
    cache.delete(oldest);
  }
  return pending;
}

/** `undefined` while loading (or while `enabled` is false), `null` when the file cannot be previewed. */
export function useThumbnail(path: string | null | undefined, enabled = true): Thumbnail | null | undefined {
  const [thumb, setThumb] = useState<Thumbnail | null | undefined>(undefined);

  useEffect(() => {
    setThumb(undefined);
    if (!path || !enabled) return;
    let live = true;
    loadThumbnail(path).then((t) => live && setThumb(t));
    return () => {
      live = false;
    };
  }, [path, enabled]);

  return thumb;
}

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

// Kept for the whole session: a path's thumbnail does not change while the app runs.
const cache = new Map<string, Promise<Thumbnail | null>>();

export function loadThumbnail(path: string): Promise<Thumbnail | null> {
  let pending = cache.get(path);
  if (!pending) {
    // A failure is not cached: the file may still be being written, so the next view retries.
    pending = api.image_editor.thumbnail(path).catch(() => {
      cache.delete(path);
      return null;
    });
    cache.set(path, pending);
  }
  return pending;
}

/** `undefined` while loading, `null` when the file cannot be previewed. */
export function useThumbnail(path: string | null | undefined): Thumbnail | null | undefined {
  const [thumb, setThumb] = useState<Thumbnail | null | undefined>(undefined);

  useEffect(() => {
    setThumb(undefined);
    if (!path) return;
    let live = true;
    loadThumbnail(path).then((t) => live && setThumb(t));
    return () => {
      live = false;
    };
  }, [path]);

  return thumb;
}

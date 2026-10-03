// Routes native file drops to the drop zone the user dropped onto.
//
// The browser drop event knows *where* the drop happened but not the full paths; pywebview's
// native handler (main.py) knows the paths and emits "files:dropped" right after. The zone
// that received the DOM drop claims the next "files:dropped" event.

import { getBackendMode, on } from "./bridge";

type DropHandler = (paths: string[]) => void;

let pending: { handler: DropHandler; at: number } | null = null;
const CLAIM_WINDOW_MS = 5000;

on("files:dropped", ({ paths }) => {
  if (pending && Date.now() - pending.at < CLAIM_WINDOW_MS) pending.handler(paths);
  pending = null;
});

// Dropping outside a zone must never navigate the WebView to the file.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

export function claimDrop(event: DragEvent | React.DragEvent, handler: DropHandler) {
  if (getBackendMode() === "mock") {
    // No native paths in a plain browser: use file names so the UI can still be exercised.
    const files = Array.from(event.dataTransfer?.files ?? []);
    handler(files.map((f) => `C:\\mock\\${f.name}`));
    return;
  }
  pending = { handler, at: Date.now() };
}

export function matchesExtensions(path: string, extensions?: string[]) {
  if (!extensions || extensions.length === 0) return true;
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

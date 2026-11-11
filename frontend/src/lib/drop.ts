// Routes native file drops to the drop zone the user dropped onto.
//
// The browser drop event knows *where* the drop happened but not the full paths; pywebview's
// native handler (main.py) knows the paths and emits "files:dropped" right after. The zone
// that received the DOM drop claims the next "files:dropped" event. A drop nobody claims
// (outside every zone) opens the "Send to" dialog so the user can pick a tool.

import { useTransferStore } from "../stores/transfer";
import { getBackendMode, on } from "./bridge";

type DropHandler = (paths: string[]) => void;

let pending: { handler: DropHandler; at: number } | null = null;
const CLAIM_WINDOW_MS = 5000;

/** Marks an element whose drops are handled by the page, so the window-wide drop hint stays hidden over it. */
export const DROP_ZONE_ATTR = "data-drop-zone";

function offerTools(paths: string[]) {
  useTransferStore.getState().openModal(paths, undefined, "drop");
}

const mockPaths = (event: DragEvent | React.DragEvent) =>
  Array.from(event.dataTransfer?.files ?? []).map((f) => `C:\\mock\\${f.name}`);

on("files:dropped", ({ paths }) => {
  const claimed = pending && Date.now() - pending.at < CLAIM_WINDOW_MS ? pending.handler : null;
  pending = null;
  if (claimed) claimed(paths);
  else if (paths.length) offerTools(paths);
});

// Dropping outside a zone must never navigate the WebView to the file.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  const handledByZone = e.defaultPrevented;
  e.preventDefault();
  // Natively the paths arrive through "files:dropped"; the mock backend has no such event.
  if (!handledByZone && getBackendMode() === "mock") {
    const paths = mockPaths(e);
    if (paths.length) offerTools(paths);
  }
});

export function claimDrop(event: DragEvent | React.DragEvent, handler: DropHandler) {
  if (getBackendMode() === "mock") {
    // No native paths in a plain browser: use file names so the UI can still be exercised.
    handler(mockPaths(event));
    return;
  }
  pending = { handler, at: Date.now() };
}

export function matchesExtensions(path: string, extensions?: string[]) {
  if (!extensions || extensions.length === 0) return true;
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

// The browser bookmark that sends the open page to the app through the mediastudio: link
// (registered by the installer, read by backend/core/protocol.py).

import type { DragEvent } from "react";

/** `void` keeps the browser from replacing the page with the value of the assignment. */
export const BOOKMARKLET = "javascript:void(location.href='mediastudio://open?url='+encodeURIComponent(location.href))";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * React 19 refuses `javascript:` hrefs, so the bookmark travels in the drag data instead:
 * Chromium browsers read the HTML anchor and the URI list, Firefox its own URL type.
 */
export function startBookmarkDrag(event: DragEvent<HTMLElement>, title: string) {
  const data = event.dataTransfer;
  data.effectAllowed = "copyLink";
  data.setData("text/uri-list", BOOKMARKLET);
  data.setData("text/x-moz-url", `${BOOKMARKLET}\n${title}`);
  data.setData("text/html", `<a href="${escapeHtml(BOOKMARKLET)}">${escapeHtml(title)}</a>`);
  data.setData("text/plain", BOOKMARKLET);
}

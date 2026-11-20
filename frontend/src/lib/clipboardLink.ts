// Video links sent to the window (clipboard:link event: the tray's "Download link from clipboard" item,
// the global shortcut and the browser bookmark) and, with the clipboardWatch setting, an offer to
// download a newly copied link when the window gets focus.

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../components/notify";
import { useDownloadForm } from "../features/download/store";
import { useInstagramForm } from "../features/instagram/store";
import { useSettings } from "../stores/settings";
import { api } from "./bridge";
import { navigate } from "./router";
import type { ClipboardLink } from "./types";

const queueLines = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

/** The download queue text with the links it does not have yet added at the end. */
export function appendToQueue(batchText: string, urls: string[]) {
  const lines = queueLines(batchText);
  return [...lines, ...urls.filter((url, i) => !lines.includes(url) && urls.indexOf(url) === i)].join("\n");
}

const isQueue = (link: ClipboardLink): link is ClipboardLink & { urls: string[] } => (link.urls?.length ?? 0) > 1;

/** What the clipboardLastLink setting stores, so the same copy is offered once. */
const linkKey = (link: ClipboardLink) => (isQueue(link) ? link.urls.join("\n") : link.url);

/** Whether the tool the link belongs to already has it. */
function alreadyOpen(link: ClipboardLink) {
  if (isQueue(link)) {
    const lines = queueLines(useDownloadForm.getState().batchText);
    return link.urls.every((url) => lines.includes(url));
  }
  const url = link.target === "instagram" ? useInstagramForm.getState().url : useDownloadForm.getState().url;
  return link.url === url;
}

function remember(link: ClipboardLink) {
  const key = linkKey(link);
  if (useSettings.getState().settings?.clipboardLastLink === key) return;
  useSettings.getState().update({ clipboardLastLink: key }).catch(() => undefined);
}

/** Opens the link in its download tool: several video links go to the queue, a single one is checked right away unless `probe` is false. */
export function openClipboardLink(link: ClipboardLink) {
  remember(link);
  if (isQueue(link)) {
    const form = useDownloadForm.getState();
    form.set({ tab: "batch", batchText: appendToQueue(form.batchText, link.urls) });
    navigate("download");
  } else if (link.target === "instagram") {
    useInstagramForm.getState().set({ url: link.url, post: null, selected: [], result: null, autoProbe: link.probe !== false });
    navigate("instagram");
  } else {
    useDownloadForm.getState().set({ tab: "single", url: link.url, probe: null, formatId: "", autoProbe: link.probe !== false });
    navigate("download");
  }
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const isInstagram = (url: string) => /^https?:\/\/([a-z0-9-]+\.)*instagram\.com(\/|$)/i.test(url);

/**
 * A link typed or pasted by the user (Home quick start). Unlike the clipboard watcher, any site is accepted,
 * since yt-dlp supports far more than the sites worth offering unasked. Several video links form a queue.
 */
export function linkFromText(text: string): ClipboardLink | null {
  const urls = [...new Set((text.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:!?)\]}]+$/, "")))];
  if (!urls.length) return null;
  const videos = urls.filter((url) => !isInstagram(url));
  if (videos.length > 1) return { url: videos[0], target: "download", urls: videos };
  const url = videos[0] ?? urls[0];
  return { url, target: isInstagram(url) ? "instagram" : "download" };
}

/** A link worth offering: not the one offered last time and not already in its tool. */
export function isNewLink(link: ClipboardLink | null): link is ClipboardLink {
  return !!link && linkKey(link) !== useSettings.getState().settings?.clipboardLastLink && !alreadyOpen(link);
}

export function useClipboardLinks() {
  const { t } = useTranslation();
  const notify = useNotify();
  const watch = useSettings((s) => s.settings?.clipboardWatch ?? false);

  useEffect(() => {
    if (!watch) return;
    const check = () => {
      api.system
        .clipboardLink()
        .then((link) => {
          if (!isNewLink(link)) return;
          remember(link);
          notify.info(t("clipboard.found"), {
            body: isQueue(link) ? t("clipboard.foundMany", { count: link.urls.length }) : link.url,
            action: { label: t("clipboard.download"), onClick: () => openClipboardLink(link) },
          });
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [watch, notify, t]);
}

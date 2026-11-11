// One way to turn a failure into text for the user, and to send unexpected ones to the backend log.

import type { TFunction } from "i18next";
import { api } from "./bridge";
import { translateMessage } from "./jobMessage";

/**
 * Text for a failed call or job: the backend's message (translated when it is an i18n key) without
 * the "Error:" / "ValueError:" prefix String(err) would add.
 */
export function errorMessage(t: TFunction, err: unknown): string {
  let text = "";
  if (err instanceof Error) text = err.message;
  else if (typeof err === "string") text = err;
  else if (err && typeof err === "object" && "message" in err && typeof err.message === "string") text = err.message;
  text = text.replace(/^(\w+)?Error:\s*/, "").trim();
  return text ? translateMessage(t, text) : t("errors.unknown");
}

const MAX_REPORTS = 20;
let reports = 0;

/** Writes an unexpected frontend error to the app log (logs folder), at most MAX_REPORTS per run. */
export function reportError(source: string, err: unknown, detail = ""): void {
  if (reports >= MAX_REPORTS) return;
  reports += 1;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const stack = [err instanceof Error ? err.stack : "", detail].filter(Boolean).join("\n");
  api.app.reportError(source, message, stack).catch(() => undefined);
}

/** Errors no component caught: thrown in an event handler or a promise nobody awaited. */
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (e) => reportError("window", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("promise", e.reason));
}

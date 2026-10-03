// Minimal hash router: routes are plain ids ("home", "converter", "settings" ...).
// Hash routing works identically under pywebview's local server and the Vite dev server.

import { useSyncExternalStore } from "react";

export const DEFAULT_ROUTE = "home";

function current(): string {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash || DEFAULT_ROUTE;
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, current);
}

export function navigate(route: string) {
  if (current() !== route) window.location.hash = `/${route}`;
}

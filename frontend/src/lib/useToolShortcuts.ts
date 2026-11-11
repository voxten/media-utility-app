import { useEffect, useRef } from "react";
import { toolShortcut, type ToolShortcut } from "./keyboard";

type ShortcutHandlers = Partial<Record<ToolShortcut, (() => unknown) | false | null | undefined>>;

/**
 * Wires the app-wide tool shortcuts; a missing or falsy handler leaves that key alone (e.g. Run while it is disabled).
 * It listens on window, so page keys handled on document (crop: Enter/Escape) call preventDefault and win.
 */
export function useToolShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const shortcut = toolShortcut(e);
      const handler = shortcut && ref.current[shortcut];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

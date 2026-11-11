/** Whether a key press goes to a text field, so single-letter page shortcuts must not react. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable === true;
}

/** Plain letter shortcuts skip presses with Ctrl, Alt or Meta, which belong to copy, paste and the system. */
export function hasCommandModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.altKey || e.metaKey;
}

export type ToolShortcut = "run" | "cancel" | "open";

/** Dialogs, menus and open dropdowns own their keys: Escape closes them, Enter picks an item. */
const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="combobox"][aria-expanded="true"]';

/** Ctrl+Enter runs the tool, Ctrl+O adds files and Escape cancels the running job, unless an overlay is open. */
export function toolShortcut(e: KeyboardEvent, root: ParentNode = document): ToolShortcut | null {
  if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey) return null;
  if (root.querySelector(OVERLAY_SELECTOR)) return null;
  const command = e.ctrlKey || e.metaKey;
  if (command && e.key === "Enter") return "run";
  if (command && e.key.toLowerCase() === "o") return "open";
  if (!command && e.key === "Escape" && !isTypingTarget(e.target)) return "cancel";
  return null;
}

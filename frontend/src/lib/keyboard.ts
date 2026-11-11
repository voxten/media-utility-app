/** Whether a key press goes to a text field, so single-letter page shortcuts must not react. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable === true;
}

/** Plain letter shortcuts skip presses with Ctrl, Alt or Meta, which belong to copy, paste and the system. */
export function hasCommandModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.altKey || e.metaKey;
}

import { useEffect } from "react";

/** Enter applies and Escape cancels the crop in progress, as the crop toolbar's tooltips promise. */
export function useCropKeys(cropping: boolean, apply: () => void, cancel: () => void) {
  useEffect(() => {
    if (!cropping) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "Enter") apply();
      else if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cropping, apply, cancel]);
}

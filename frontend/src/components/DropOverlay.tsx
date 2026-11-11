// Window-wide hint while files are dragged over the app: a drop outside every drop zone
// opens the "Send to" dialog (lib/drop.ts). Hidden over drop zones, which show their own state.

import { useEffect, useState } from "react";
import { Body1Strong, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ArrowUpload20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { DROP_ZONE_ATTR } from "../lib/drop";

/** dragover fires every few hundred ms while dragging; no event for this long means the drag left. */
const HIDE_AFTER_MS = 250;

const useStyles = makeStyles({
  frame: {
    position: "fixed",
    inset: "0",
    zIndex: 1000,
    pointerEvents: "none",
    border: `2px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: "24px",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    boxShadow: tokens.shadow16,
  },
  hidden: { display: "none" },
});

const draggingFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function DropOverlay() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [state, setState] = useState<"none" | "window" | "zone">("none");

  useEffect(() => {
    let timer = 0;
    const hide = () => {
      window.clearTimeout(timer);
      setState("none");
    };
    const onDragOver = (e: DragEvent) => {
      if (!draggingFiles(e)) return;
      const overZone = e.target instanceof Element && e.target.closest(`[${DROP_ZONE_ATTR}]`);
      setState(overZone ? "zone" : "window");
      window.clearTimeout(timer);
      timer = window.setTimeout(hide, HIDE_AFTER_MS);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", hide);
    window.addEventListener("dragend", hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", hide);
      window.removeEventListener("dragend", hide);
    };
  }, []);

  return (
    <div className={mergeClasses(styles.frame, state !== "window" && styles.hidden)} aria-hidden>
      <div className={styles.pill}>
        <ArrowUpload20Regular />
        <Body1Strong>{t("transfer.dropHint")}</Body1Strong>
      </div>
    </div>
  );
}

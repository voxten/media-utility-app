import { useState, type ReactNode } from "react";
import { Body1Strong, Caption1, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { ArrowUpload24Regular, type FluentIcon } from "@fluentui/react-icons";
import { claimDrop, matchesExtensions } from "../lib/drop";

const useStyles = makeStyles({
  zone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "28px 24px",
    textAlign: "center",
    borderRadius: tokens.borderRadiusXLarge,
    border: `1.5px dashed ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    cursor: "pointer",
    transitionProperty: "background-color, border-color, transform",
    transitionDuration: tokens.durationFast,
    outlineStyle: "none",
    ":hover": { ...shorthands.borderColor(tokens.colorBrandStroke1), backgroundColor: tokens.colorNeutralBackground2Hover },
    ":focus-visible": { ...shorthands.borderColor(tokens.colorStrokeFocus2), ...shorthands.borderStyle("solid") },
  },
  compact: { flexDirection: "row", padding: "14px 20px", gap: "12px", textAlign: "left" },
  active: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    ...shorthands.borderStyle("solid"),
    backgroundColor: tokens.colorBrandBackground2,
    transform: "scale(1.005)",
  },
  icon: {
    color: tokens.colorBrandForeground1,
    "& svg": { width: "32px", height: "32px" },
  },
  iconCompact: { "& svg": { width: "22px", height: "22px" } },
  hint: { color: tokens.colorNeutralForeground3 },
  texts: { display: "flex", flexDirection: "column", gap: "2px" },
});

interface DropZoneProps {
  title: ReactNode;
  hint?: ReactNode;
  icon?: FluentIcon;
  /** Allowed extensions, e.g. [".pdf"]. Folders are passed through when allowFolders is set. */
  accept?: string[];
  allowFolders?: boolean;
  compact?: boolean;
  onFiles: (paths: string[]) => void;
  onBrowse?: () => void;
  className?: string;
}

export function DropZone({ title, hint, icon: Icon = ArrowUpload24Regular, accept, allowFolders, compact, onFiles, onBrowse, className }: DropZoneProps) {
  const styles = useStyles();
  const [over, setOver] = useState(false);

  const accepts = (path: string) => matchesExtensions(path, accept) || (allowFolders && !/\.[^\\/]+$/.test(path));

  return (
    <div
      role="button"
      tabIndex={0}
      className={mergeClasses(styles.zone, compact && styles.compact, over && styles.active, className)}
      onClick={onBrowse}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onBrowse?.()}
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        claimDrop(e, (paths) => {
          const accepted = paths.filter(accepts);
          if (accepted.length) onFiles(accepted);
        });
      }}
    >
      <span className={mergeClasses(styles.icon, compact && styles.iconCompact)}>
        <Icon />
      </span>
      <div className={styles.texts}>
        <Body1Strong>{title}</Body1Strong>
        {hint && <Caption1 className={styles.hint}>{hint}</Caption1>}
      </div>
    </div>
  );
}

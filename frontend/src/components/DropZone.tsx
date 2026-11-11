import { useState, type ReactNode } from "react";
import { Body1, Body1Strong, Caption1, makeStyles, mergeClasses, shorthands, Subtitle1, tokens } from "@fluentui/react-components";
import { ArrowUpload24Regular, type FluentIcon } from "@fluentui/react-icons";
import { claimDrop, DROP_ZONE_ATTR, matchesExtensions } from "../lib/drop";

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
    backgroundColor: tokens.colorNeutralCardBackground,
    color: tokens.colorNeutralForeground2,
    cursor: "pointer",
    transitionProperty: "background-color, border-color, transform",
    transitionDuration: tokens.durationFast,
    outlineStyle: "none",
    ":hover": { ...shorthands.borderColor(tokens.colorBrandStroke1), backgroundColor: tokens.colorNeutralCardBackgroundHover },
    ":focus-visible": { ...shorthands.borderColor(tokens.colorStrokeFocus2), ...shorthands.borderStyle("solid") },
  },
  compact: { flexDirection: "row", padding: "14px 20px", gap: "12px", textAlign: "left" },
  fill: { flexGrow: 1, minHeight: "320px", gap: "12px", padding: "48px 24px" },
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
  iconFill: {
    width: "72px",
    height: "72px",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    marginBottom: "4px",
  },
  hint: { color: tokens.colorNeutralForeground3 },
  texts: { display: "flex", flexDirection: "column", gap: "2px" },
  textsFill: { gap: "6px" },
});

interface DropZoneProps {
  title: ReactNode;
  hint?: ReactNode;
  icon?: FluentIcon;
  /** Allowed extensions, e.g. [".pdf"]. Folders are passed through when allowFolders is set. */
  accept?: string[];
  allowFolders?: boolean;
  compact?: boolean;
  /** Grow to fill the page; for a tool page that shows nothing else until files are added. */
  fill?: boolean;
  onFiles: (paths: string[]) => void;
  onBrowse?: () => void;
  className?: string;
}

export function DropZone({ title, hint, icon: Icon = ArrowUpload24Regular, accept, allowFolders, compact, fill, onFiles, onBrowse, className }: DropZoneProps) {
  const styles = useStyles();
  const [over, setOver] = useState(false);

  const accepts = (path: string) => matchesExtensions(path, accept) || (allowFolders && !/\.[^\\/]+$/.test(path));

  return (
    <div
      {...{ [DROP_ZONE_ATTR]: "" }}
      role="button"
      tabIndex={0}
      className={mergeClasses(styles.zone, compact && styles.compact, fill && styles.fill, over && styles.active, className)}
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
      <span className={mergeClasses(styles.icon, compact && styles.iconCompact, fill && styles.iconFill)}>
        <Icon />
      </span>
      <div className={mergeClasses(styles.texts, fill && styles.textsFill)}>
        {fill ? <Subtitle1>{title}</Subtitle1> : <Body1Strong>{title}</Body1Strong>}
        {hint && (fill ? <Body1 className={styles.hint}>{hint}</Body1> : <Caption1 className={styles.hint}>{hint}</Caption1>)}
      </div>
    </div>
  );
}

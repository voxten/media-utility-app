import type { ReactNode } from "react";
import { Body1Strong, Caption1, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { FluentIcon } from "@fluentui/react-icons";

// Windows 11 "settings card": icon, title + description on the left, control on the right.

const useStyles = makeStyles({
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minHeight: "68px",
    padding: "12px 20px",
    boxSizing: "border-box",
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  stacked: { flexWrap: "wrap" },
  icon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    "& svg": { width: "22px", height: "22px", display: "block" },
  },
  text: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: "200px", gap: "2px" },
  description: { color: tokens.colorNeutralForeground3 },
  control: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, maxWidth: "100%" },
  wideControl: { flexBasis: "100%", flexShrink: 1 },
  indented: { paddingLeft: "38px" },
});

interface SettingRowProps {
  icon?: FluentIcon;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Put the control under the text (for wide inputs). */
  wide?: boolean;
}

export function SettingRow({ icon: Icon, title, description, children, wide }: SettingRowProps) {
  const styles = useStyles();
  return (
    <div className={mergeClasses(styles.row, wide && styles.stacked)}>
      {Icon && (
        <span className={styles.icon}>
          <Icon />
        </span>
      )}
      <div className={styles.text}>
        <Body1Strong>{title}</Body1Strong>
        {description && <Caption1 className={styles.description}>{description}</Caption1>}
      </div>
      {children && (
        <div className={mergeClasses(styles.control, wide && styles.wideControl, wide && Icon && styles.indented)}>{children}</div>
      )}
    </div>
  );
}

export function SettingGroup({ children }: { children: ReactNode }) {
  return <div className={useStyles().group}>{children}</div>;
}

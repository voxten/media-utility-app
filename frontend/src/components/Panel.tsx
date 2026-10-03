// Content card used inside tool pages (title row + body), Windows 11 "card" look.

import type { ReactNode } from "react";
import { makeStyles, mergeClasses, Subtitle2, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "20px",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    minWidth: 0,
    boxSizing: "border-box",
  },
  head: { display: "flex", alignItems: "center", gap: "12px", minHeight: "32px", flexWrap: "wrap", minWidth: 0 },
  title: { flexGrow: 1, minWidth: 0 },
  actions: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", minWidth: 0 },
});

interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, actions, children, className }: PanelProps) {
  const styles = useStyles();
  return (
    <section className={mergeClasses(styles.panel, className)}>
      {(title || actions) && (
        <div className={styles.head}>
          {title && <Subtitle2 className={styles.title}>{title}</Subtitle2>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

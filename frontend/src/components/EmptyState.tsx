import type { ReactNode } from "react";
import { Body1, makeStyles, Subtitle2, tokens } from "@fluentui/react-components";
import type { FluentIcon } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    padding: "40px 24px",
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  icon: { "& svg": { width: "40px", height: "40px" }, marginBottom: "6px", color: tokens.colorNeutralForeground4 },
  title: { color: tokens.colorNeutralForeground2 },
});

export function EmptyState({ icon: Icon, title, children }: { icon?: FluentIcon; title: ReactNode; children?: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      {Icon && (
        <span className={styles.icon}>
          <Icon />
        </span>
      )}
      <Subtitle2 className={styles.title}>{title}</Subtitle2>
      {children && <Body1>{children}</Body1>}
    </div>
  );
}

import type { ReactNode } from "react";
import { makeStyles, mergeClasses, Subtitle2, Text, Title2, tokens } from "@fluentui/react-components";
import type { FluentIcon } from "@fluentui/react-icons";

const useStyles = makeStyles({
  scroll: {
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarGutter: "stable",
  },
  inner: {
    maxWidth: "1120px",
    margin: "0 auto",
    padding: "32px 40px 48px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  iconTile: {
    width: "48px",
    height: "48px",
    flexShrink: 0,
    borderRadius: tokens.borderRadiusXLarge,
    display: "grid",
    placeItems: "center",
    color: "#fff",
    boxShadow: tokens.shadow4,
    "& svg": { width: "26px", height: "26px" },
  },
  titles: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flexGrow: 1 },
  description: { color: tokens.colorNeutralForeground3 },
  actions: { display: "flex", gap: "8px", alignItems: "center" },
  section: { display: "flex", flexDirection: "column", gap: "8px" },
  sectionTitle: { marginTop: "4px" },
});

interface PageProps {
  title: string;
  description?: string;
  icon?: FluentIcon;
  accent?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Page({ title, description, icon: Icon, accent, actions, children, className }: PageProps) {
  const styles = useStyles();
  return (
    <div className={styles.scroll}>
      <div className={mergeClasses(styles.inner, className)}>
        <header className={styles.header}>
          {Icon && (
            <div
              className={styles.iconTile}
              style={{ background: `linear-gradient(135deg, ${accent ?? tokens.colorBrandBackground}, ${accent ?? tokens.colorBrandBackground}cc)` }}
            >
              <Icon />
            </div>
          )}
          <div className={styles.titles}>
            <Title2 as="h1">{title}</Title2>
            {description && <Text className={styles.description}>{description}</Text>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <section className={styles.section}>
      {title && (
        <Subtitle2 as="h2" className={styles.sectionTitle}>
          {title}
        </Subtitle2>
      )}
      {children}
    </section>
  );
}

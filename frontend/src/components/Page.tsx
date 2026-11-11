import { useState, type ReactNode } from "react";
import { Caption1, makeStyles, mergeClasses, Subtitle2, Title3, tokens } from "@fluentui/react-components";
import type { FluentIcon } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { appTokens } from "../app/theme";
import { toolById } from "../app/tools";
import { PAGE_GUTTER, PAGE_MAX_WIDTH, PageFooterContext } from "./pageFooter";

const useStyles = makeStyles({
  root: { height: "100%", display: "flex", flexDirection: "column", minHeight: 0 },
  scroll: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarGutter: "stable",
  },
  inner: {
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
    padding: `24px ${PAGE_GUTTER} 32px`,
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    boxSizing: "border-box",
    minHeight: "100%",
  },
  footer: {
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralCardBackground,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    ":empty": { display: "none" },
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  iconTile: {
    width: "40px",
    height: "40px",
    flexShrink: 0,
    borderRadius: tokens.borderRadiusLarge,
    display: "grid",
    placeItems: "center",
    color: tokens.colorNeutralForegroundStaticInverted,
    "& svg": { width: "22px", height: "22px" },
  },
  titles: { display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 },
  title: { fontFamily: appTokens.fontFamilyDisplay, lineHeight: tokens.lineHeightBase500 },
  description: { color: tokens.colorNeutralForeground3 },
  actions: { display: "flex", gap: "8px", alignItems: "center" },
  section: { display: "flex", flexDirection: "column", gap: "8px" },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    minHeight: "32px",
  },
  sectionTitle: { marginTop: "4px", marginBottom: "0" },
  sectionActions: { display: "flex", gap: "8px", alignItems: "center" },
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
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  return (
    <PageFooterContext.Provider value={footer}>
      <div className={styles.root}>
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
                <Title3 as="h1" className={styles.title}>
                  {title}
                </Title3>
                {description && <Caption1 className={styles.description}>{description}</Caption1>}
              </div>
              {actions && <div className={styles.actions}>{actions}</div>}
            </header>
            {children}
          </div>
        </div>
        <div ref={setFooter} className={styles.footer} />
      </div>
    </PageFooterContext.Provider>
  );
}

/** Page for a tool from app/tools.tsx; title, description, icon and accent come from its definition. */
export function ToolPage({ toolId, ...rest }: Omit<PageProps, "title" | "description" | "icon" | "accent"> & { toolId: string }) {
  const { t } = useTranslation();
  const tool = toolById(toolId);
  return (
    <Page
      title={t(`tools.${toolId}.name`)}
      description={t(`tools.${toolId}.description`)}
      icon={tool?.icon}
      accent={tool?.accent}
      {...rest}
    />
  );
}

export interface SectionProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Section({ title, actions, children }: SectionProps) {
  const styles = useStyles();
  return (
    <section className={styles.section}>
      {(title || actions) && (
        <div className={styles.sectionHeader}>
          {title && (
            <Subtitle2 as="h2" className={styles.sectionTitle}>
              {title}
            </Subtitle2>
          )}
          {actions && <div className={styles.sectionActions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

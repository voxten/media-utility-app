import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  Badge,
  Caption1,
  createFocusOutlineStyle,
  Hamburger,
  makeStyles,
  mergeClasses,
  Spinner,
  Subtitle2,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  bundleIcon,
  Home24Filled,
  Home24Regular,
  Search24Regular,
  Settings24Filled,
  Settings24Regular,
  TaskListLtr24Filled,
  TaskListLtr24Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { navigate } from "../lib/router";
import { useRunningJobCount } from "../stores/jobs";
import { useUi } from "../stores/ui";
import { CATEGORIES, TOOLS } from "./tools";

const HomeIcon = bundleIcon(Home24Filled, Home24Regular);
const SettingsIcon = bundleIcon(Settings24Filled, Settings24Regular);
const JobsIcon = bundleIcon(TaskListLtr24Filled, TaskListLtr24Regular);

const EXPANDED_WIDTH = 272;
const RAIL_WIDTH = 56;
// Every row keeps its icon in a 40px box 8px from the edge, so icons never move horizontally.
const GUTTER = 8;
const ICON_BOX = RAIL_WIDTH - 2 * GUTTER;

// Labels fade out quickly before the rail narrows, and fade in once it has mostly widened.
const fadeOut = { opacity: 0, transitionProperty: "opacity", transitionDuration: tokens.durationFaster };
const fadeIn = {
  opacity: 1,
  transitionProperty: "opacity",
  transitionDuration: tokens.durationNormal,
  transitionDelay: tokens.durationFast,
};

const useStyles = makeStyles({
  nav: {
    width: `${EXPANDED_WIDTH}px`,
    flexShrink: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transitionProperty: "width",
    transitionDuration: tokens.durationGentle,
    transitionTimingFunction: tokens.curveEasyEase,
  },
  collapsed: { width: `${RAIL_WIDTH}px` },

  header: {
    display: "flex",
    alignItems: "center",
    height: "48px",
    flexShrink: 0,
    paddingInline: `${GUTTER}px`,
  },
  hamburger: { width: `${ICON_BOX}px`, minWidth: `${ICON_BOX}px`, height: "36px", flexShrink: 0 },
  brand: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0, paddingLeft: "8px" },
  logo: { width: "24px", height: "24px", flexShrink: 0, display: "block" },
  brandText: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  body: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingBottom: "8px",
    scrollbarWidth: "none",
  },
  footer: { flexShrink: 0, display: "flex", flexDirection: "column", paddingBlock: "4px 8px" },
  group: { display: "flex", flexDirection: "column", flexShrink: 0 },
  divider: {
    height: "1px",
    flexShrink: 0,
    marginBlock: "6px",
    marginInline: `${GUTTER + 4}px`,
    backgroundColor: tokens.colorNeutralStroke2,
  },

  item: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
    flexShrink: 0,
    width: `calc(100% - ${2 * GUTTER}px)`,
    height: "40px",
    marginInline: `${GUTTER}px`,
    marginBlock: "2px",
    padding: 0,
    border: `1px solid transparent`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground2,
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "background-color, border-color",
    transitionDuration: tokens.durationFaster,
    ":hover": { backgroundColor: tokens.colorNeutralBackground4Hover, color: tokens.colorNeutralForeground1 },
    ":active": { backgroundColor: tokens.colorNeutralBackground4Pressed },
    ...createFocusOutlineStyle(),
  },
  selected: {
    backgroundColor: tokens.colorNeutralBackground4Selected,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    "::before": {
      content: '""',
      position: "absolute",
      left: "-1px",
      top: "11px",
      bottom: "11px",
      width: "3px",
      borderRadius: "2px",
      backgroundColor: tokens.colorCompoundBrandForeground1,
      animationName: { from: { transform: "scaleY(0)" }, to: { transform: "scaleY(1)" } },
      animationDuration: tokens.durationNormal,
      animationTimingFunction: tokens.curveDecelerateMid,
    },
  },
  icon: {
    position: "relative",
    flexShrink: 0,
    width: `${ICON_BOX - 2}px`,
    height: "100%",
    display: "grid",
    placeItems: "center",
    fontSize: "20px",
  },
  label: {
    flexGrow: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingRight: "12px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  labelText: { overflow: "hidden", textOverflow: "ellipsis" },
  trailing: { marginLeft: "auto", flexShrink: 0 },
  hidden: fadeOut,
  shown: fadeIn,

  // Looks like a search box when expanded and like a plain icon button in the rail.
  search: { height: "36px", marginBottom: "4px" },
  searchBox: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
  },
  kbd: {
    marginLeft: "auto",
    flexShrink: 0,
    paddingInline: "6px",
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
  },

  railBadge: {
    position: "absolute",
    top: "3px",
    right: "1px",
    pointerEvents: "none",
  },

  sectionHeader: {
    height: "30px",
    display: "flex",
    alignItems: "flex-end",
    paddingInline: `${GUTTER + 12}px`,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    transitionProperty: "height, opacity",
    transitionDuration: `${tokens.durationGentle}, ${tokens.durationFast}`,
    transitionTimingFunction: tokens.curveEasyEase,
  },
  sectionHeaderCollapsed: { height: 0, opacity: 0 },
});

/** Tooltip that only shows while the rail is collapsed (the label is visible otherwise). */
function RailTooltip({ enabled, content, children }: { enabled: boolean; content: string; children: ReactElement }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  return (
    <Tooltip
      content={content}
      relationship="inaccessible"
      positioning="after"
      withArrow
      showDelay={350}
      hideDelay={100}
      visible={enabled && visible}
      onVisibleChange={(_, data) => {
        if (!enabled) setVisible(false);
        else setVisible(data.visible);
      }}
    >
      {children}
    </Tooltip>
  );
}

interface NavItemProps {
  collapsed: boolean;
  tooltipEnabled?: boolean;
  icon: ReactNode;
  label: string;
  tooltip?: string;
  selected?: boolean;
  className?: string;
  /** Rendered after the label (fades with it). */
  trailing?: ReactNode;
  /** Rendered over the icon (visible only in the rail). */
  iconOverlay?: ReactNode;
  onClick: () => void;
}

function NavItem({ collapsed, tooltipEnabled, icon, label, tooltip, selected, className, trailing, iconOverlay, onClick }: NavItemProps) {
  const styles = useStyles();
  return (
    <RailTooltip enabled={tooltipEnabled ?? collapsed} content={tooltip ?? label}>
      <button
        type="button"
        className={mergeClasses(styles.item, selected && styles.selected, className)}
        aria-current={selected ? "page" : undefined}
        onClick={(e) => {
          (e.currentTarget as HTMLElement).blur();
          onClick();
        }}
      >
        <span className={styles.icon}>
          {icon}
          {iconOverlay && (
            <span className={mergeClasses(styles.railBadge, collapsed ? styles.shown : styles.hidden)}>{iconOverlay}</span>
          )}
        </span>
        <span className={mergeClasses(styles.label, collapsed ? styles.hidden : styles.shown)}>
          <span className={styles.labelText}>{label}</span>
          {trailing}
        </span>
      </button>
    </RailTooltip>
  );
}

interface NavigationProps {
  route: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function Navigation({ route, collapsed, onToggle }: NavigationProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const running = useRunningJobCount();
  const toggleLabel = collapsed ? t("nav.expand") : t("nav.collapse");
  const runningLabel = running > 0 ? t("nav.runningJobs", { count: running }) : t("jobs.title");
  const fade = collapsed ? styles.hidden : styles.shown;

  const [animating, setAnimating] = useState(false);
  const [hamburgerTooltip, setHamburgerTooltip] = useState(false);
  const prevCollapsed = useRef(collapsed);

  useEffect(() => {
    if (prevCollapsed.current !== collapsed) {
      prevCollapsed.current = collapsed;
      setAnimating(true);
      setHamburgerTooltip(false);
      const timer = window.setTimeout(() => setAnimating(false), 320);
      return () => window.clearTimeout(timer);
    }
  }, [collapsed]);

  const tooltipEnabled = collapsed && !animating;

  const routeItem = (id: string, Icon: FluentIcon, label: string) => (
    <NavItem
      key={id}
      collapsed={collapsed}
      tooltipEnabled={tooltipEnabled}
      icon={<Icon />}
      label={label}
      selected={route === id}
      onClick={() => navigate(id)}
    />
  );

  return (
    <nav className={mergeClasses(styles.nav, collapsed && styles.collapsed)} aria-label={t("app.name")}>
      <div className={styles.header}>
        <Tooltip
          content={toggleLabel}
          relationship="label"
          positioning={collapsed ? "after" : "below"}
          showDelay={400}
          hideDelay={100}
          visible={hamburgerTooltip && !animating}
          onVisibleChange={(_, d) => setHamburgerTooltip(d.visible)}
        >
          <Hamburger
            className={styles.hamburger}
            onClick={(e) => {
              setHamburgerTooltip(false);
              (e.currentTarget as HTMLElement).blur();
              onToggle();
            }}
            aria-expanded={!collapsed}
          />
        </Tooltip>
        <div className={mergeClasses(styles.brand, fade)} aria-hidden={collapsed}>
          <img className={styles.logo} src="./app.png" alt="" />
          <Subtitle2 className={styles.brandText}>{t("app.name")}</Subtitle2>
        </div>
      </div>

      <NavItem
        collapsed={collapsed}
        tooltipEnabled={tooltipEnabled}
        className={mergeClasses(styles.search, !collapsed && styles.searchBox)}
        icon={<Search24Regular />}
        label={t("palette.title")}
        tooltip={`${t("palette.title")} (Ctrl+K)`}
        trailing={<Caption1 className={styles.kbd}>Ctrl+K</Caption1>}
        onClick={() => useUi.getState().setPaletteOpen(true)}
      />

      <div className={styles.body}>
        {routeItem("home", HomeIcon, t("nav.home"))}
        {CATEGORIES.map((category) => (
          <div key={category} className={styles.group} role="group" aria-label={t(`categories.${category}`)}>
            <div
              className={mergeClasses(styles.sectionHeader, collapsed && styles.sectionHeaderCollapsed)}
              aria-hidden
            >
              {t(`categories.${category}`)}
            </div>
            {TOOLS.filter((tool) => tool.category === category).map((tool) =>
              routeItem(tool.id, tool.icon, t(`tools.${tool.id}.name`)),
            )}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.divider} />
        <NavItem
          collapsed={collapsed}
          tooltipEnabled={tooltipEnabled}
          icon={running > 0 ? <Spinner size="extra-tiny" /> : <JobsIcon />}
          label={t("jobs.title")}
          tooltip={runningLabel}
          trailing={
            running > 0 && (
              <Badge size="small" className={styles.trailing}>
                {running}
              </Badge>
            )
          }
          iconOverlay={running > 0 && <Badge size="small">{running}</Badge>}
          onClick={() => useUi.getState().setJobsOpen(true)}
        />
        {routeItem("settings", SettingsIcon, t("nav.settings"))}
      </div>
    </nav>
  );
}

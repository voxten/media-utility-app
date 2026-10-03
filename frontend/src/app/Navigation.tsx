import {
  Badge,
  Button,
  Hamburger,
  makeStyles,
  mergeClasses,
  NavDivider,
  NavDrawer,
  NavDrawerBody,
  NavDrawerFooter,
  NavItem,
  NavSectionHeader,
  Spinner,
  Subtitle2,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  bundleIcon,
  Home24Filled,
  Home24Regular,
  Settings24Filled,
  Search20Regular,
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
const JOBS_ITEM = "__jobs";

const EXPANDED_WIDTH = 272;
const RAIL_WIDTH = 56;

const useStyles = makeStyles({
  drawer: {
    width: `${EXPANDED_WIDTH}px`,
    backgroundColor: "transparent",
    border: "none",
    height: "100%",
  },
  header: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px 6px 10px" },
  brand: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  logo: {
    width: "26px",
    height: "26px",
    borderRadius: "7px",
    background: `linear-gradient(135deg, ${tokens.colorBrandBackground}, #8a5cf6)`,
    flexShrink: 0,
    boxShadow: tokens.shadow4,
  },
  brandText: { flexGrow: 1 },
  search: { marginLeft: "auto" },
  jobsLabel: { display: "flex", alignItems: "center", gap: "8px", width: "100%" },
  jobsBadge: { marginLeft: "auto" },
  railJobs: { position: "relative" },
  railBadge: { position: "absolute", top: "0", right: "0", pointerEvents: "none" },
  rail: {
    width: `${RAIL_WIDTH}px`,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    paddingBlock: "10px",
    boxSizing: "border-box",
  },
  railSpacer: { flexGrow: 1 },
  railButton: { position: "relative", width: "40px", height: "36px", minWidth: "40px" },
  railSelected: {
    backgroundColor: tokens.colorSubtleBackgroundSelected,
    "::before": {
      content: '""',
      position: "absolute",
      left: "0",
      top: "10px",
      bottom: "10px",
      width: "3px",
      borderRadius: "2px",
      backgroundColor: tokens.colorCompoundBrandForeground1,
    },
  },
  railDivider: { width: "24px", height: "1px", backgroundColor: tokens.colorNeutralStroke2, marginBlock: "6px" },
});

interface NavigationProps {
  route: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function Navigation({ route, collapsed, onToggle }: NavigationProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const running = useRunningJobCount();
  const label = collapsed ? t("nav.expand") : t("nav.collapse");
  const openJobs = () => useUi.getState().setJobsOpen(true);
  const openPalette = () => useUi.getState().setPaletteOpen(true);
  const searchLabel = `${t("palette.title")} (Ctrl+K)`;
  const runningLabel = running > 0 ? t("nav.runningJobs", { count: running }) : t("jobs.title");

  if (collapsed) {
    const railItem = (id: string, Icon: FluentIcon, text: string) => (
      <Tooltip key={id} content={text} relationship="label" positioning="after">
        <Button
          appearance="subtle"
          className={mergeClasses(styles.railButton, route === id && styles.railSelected)}
          icon={<Icon />}
          onClick={() => navigate(id)}
          aria-current={route === id ? "page" : undefined}
        />
      </Tooltip>
    );
    return (
      <nav className={styles.rail}>
        <Tooltip content={label} relationship="label" positioning="after">
          <Hamburger onClick={onToggle} />
        </Tooltip>
        <Tooltip content={searchLabel} relationship="label" positioning="after">
          <Button appearance="subtle" className={styles.railButton} icon={<Search20Regular />} onClick={openPalette} />
        </Tooltip>
        <div className={styles.railDivider} />
        {railItem("home", HomeIcon, t("nav.home"))}
        <div className={styles.railDivider} />
        {TOOLS.map((tool) => railItem(tool.id, tool.icon, t(`tools.${tool.id}.name`)))}
        <div className={styles.railSpacer} />
        <Tooltip content={runningLabel} relationship="label" positioning="after">
          <span className={styles.railJobs}>
            <Button appearance="subtle" className={styles.railButton} icon={running > 0 ? <Spinner size="extra-tiny" /> : <JobsIcon />} onClick={openJobs} />
            {running > 0 && (
              <Badge size="small" className={styles.railBadge}>
                {running}
              </Badge>
            )}
          </span>
        </Tooltip>
        {railItem("settings", SettingsIcon, t("nav.settings"))}
      </nav>
    );
  }

  return (
    <NavDrawer
      open
      type="inline"
      className={styles.drawer}
      selectedValue={route}
      // No slide-in animation when the app starts or the rail expands.
      surfaceMotion={null}
      onNavItemSelect={(_, data) => (data.value === JOBS_ITEM ? openJobs() : navigate(String(data.value)))}
    >
      <div className={styles.header}>
        <Tooltip content={label} relationship="label">
          <Hamburger onClick={onToggle} />
        </Tooltip>
        <div className={styles.brand}>
          <div className={styles.logo} />
          <Subtitle2 className={styles.brandText}>{t("app.name")}</Subtitle2>
        </div>
        <Tooltip content={searchLabel} relationship="label">
          <Button appearance="subtle" className={styles.search} icon={<Search20Regular />} onClick={openPalette} />
        </Tooltip>
      </div>
      <NavDrawerBody>
        <NavItem value="home" icon={<HomeIcon />}>
          {t("nav.home")}
        </NavItem>
        {CATEGORIES.map((category) => (
          <div key={category}>
            <NavSectionHeader>{t(`categories.${category}`)}</NavSectionHeader>
            {TOOLS.filter((tool) => tool.category === category).map((tool) => (
              <NavItem key={tool.id} value={tool.id} icon={<tool.icon />}>
                {t(`tools.${tool.id}.name`)}
              </NavItem>
            ))}
          </div>
        ))}
      </NavDrawerBody>
      <NavDrawerFooter>
        <NavDivider />
        <NavItem value={JOBS_ITEM} icon={running > 0 ? <Spinner size="extra-tiny" /> : <JobsIcon />}>
          <span className={styles.jobsLabel}>
            {t("jobs.title")}
            {running > 0 && (
              <Badge size="small" className={styles.jobsBadge}>
                {running}
              </Badge>
            )}
          </span>
        </NavItem>
        <NavItem value="settings" icon={<SettingsIcon />}>
          {t("nav.settings")}
        </NavItem>
      </NavDrawerFooter>
    </NavDrawer>
  );
}

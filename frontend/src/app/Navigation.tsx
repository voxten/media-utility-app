import {
  Button,
  Caption1,
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
  Settings24Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { navigate } from "../lib/router";
import { useRunningJobCount } from "../stores/jobs";
import { CATEGORIES, TOOLS } from "./tools";

const HomeIcon = bundleIcon(Home24Filled, Home24Regular);
const SettingsIcon = bundleIcon(Settings24Filled, Settings24Regular);

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
  jobs: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    color: tokens.colorNeutralForeground2,
  },
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
        <div className={styles.railDivider} />
        {railItem("home", HomeIcon, t("nav.home"))}
        <div className={styles.railDivider} />
        {TOOLS.map((tool) => railItem(tool.id, tool.icon, t(`tools.${tool.id}.name`)))}
        <div className={styles.railSpacer} />
        {running > 0 && (
          <Tooltip content={t("nav.runningJobs", { count: running })} relationship="label" positioning="after">
            <Spinner size="tiny" />
          </Tooltip>
        )}
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
      onNavItemSelect={(_, data) => navigate(String(data.value))}
    >
      <div className={styles.header}>
        <Tooltip content={label} relationship="label">
          <Hamburger onClick={onToggle} />
        </Tooltip>
        <div className={styles.brand}>
          <div className={styles.logo} />
          <Subtitle2>{t("app.name")}</Subtitle2>
        </div>
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
        {running > 0 && (
          <div className={styles.jobs}>
            <Spinner size="extra-tiny" />
            <Caption1>{t("nav.runningJobs", { count: running })}</Caption1>
          </div>
        )}
        <NavDivider />
        <NavItem value="settings" icon={<SettingsIcon />}>
          {t("nav.settings")}
        </NavItem>
      </NavDrawerFooter>
    </NavDrawer>
  );
}

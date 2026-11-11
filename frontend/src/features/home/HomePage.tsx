import { useState } from "react";
import { Body1, Body1Strong, Button, Caption1, makeStyles, mergeClasses, shorthands, Text, tokens } from "@fluentui/react-components";
import { ArrowRight16Regular, DocumentAdd16Regular, History24Regular, Link24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { CATEGORIES, CATEGORY_ACCENTS, CATEGORY_ICONS, TOOLS, toolById, type ToolDefinition } from "../../app/tools";
import { HistoryJobCard, JobCard } from "../../components/JobCard";
import { Page, Section } from "../../components/Page";
import { ToolIconTile } from "../../components/ToolIconTile";
import { api } from "../../lib/bridge";
import { linkFromText, openClipboardLink } from "../../lib/clipboardLink";
import { claimDrop, DROP_ZONE_ATTR } from "../../lib/drop";
import { allFilesFilter } from "../../lib/fileTypes";
import { navigate } from "../../lib/router";
import { earlierJobs, listedJobs, useJobs } from "../../stores/jobs";
import { useRecentTools } from "../../stores/recentTools";
import { useTransferStore } from "../../stores/transfer";

const useStyles = makeStyles({
  quick: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "56px",
    padding: "0 8px 0 18px",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralCardBackground,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
    color: tokens.colorNeutralForeground3,
    transitionProperty: "border-color, background-color",
    transitionDuration: tokens.durationFast,
    ":hover:not(:focus-within)": { ...shorthands.borderColor(tokens.colorNeutralStroke1Hover) },
    ":focus-within": { ...shorthands.borderColor(tokens.colorBrandStroke1) },
  },
  quickOver: {
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    ...shorthands.borderStyle("dashed"),
  },
  quickIcon: { display: "flex", flexShrink: 0, "& svg": { width: "20px", height: "20px" } },
  quickInput: {
    flexGrow: 1,
    minWidth: 0,
    height: "100%",
    padding: 0,
    border: "none",
    outlineStyle: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase400,
    "::placeholder": { color: tokens.colorNeutralForeground4 },
  },
  // Category groups flow into as many ~300px columns as fit, like a launcher.
  groups: { columnWidth: "300px", columnGap: "16px" },
  group: {
    breakInside: "avoid",
    marginBottom: "16px",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralCardBackground,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  groupTitle: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", color: tokens.colorNeutralForeground1 },
  groupIcon: { display: "flex", "& svg": { width: "20px", height: "20px" } },
  row: {
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr)",
    alignItems: "center",
    columnGap: "12px",
    width: "100%",
    padding: "8px",
    textAlign: "left",
    border: "none",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    cursor: "pointer",
    outlineStyle: "none",
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
    ":active": { backgroundColor: tokens.colorSubtleBackgroundPressed },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  rowText: { display: "flex", flexDirection: "column", minWidth: 0 },
  description: {
    color: tokens.colorNeutralForeground3,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  recent: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
  recentCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "12px",
    padding: "14px",
    textAlign: "left",
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralCardBackground,
    color: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    cursor: "pointer",
    outlineStyle: "none",
    transitionProperty: "background-color, border-color",
    transitionDuration: tokens.durationFast,
    ":hover": { backgroundColor: tokens.colorNeutralCardBackgroundHover, ...shorthands.borderColor(tokens.colorNeutralStroke2) },
    ":active": { backgroundColor: tokens.colorNeutralCardBackgroundPressed },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  jobs: { display: "flex", flexDirection: "column", gap: "8px" },
  empty: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "20px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
  },
});

function ToolTile({ tool, large }: { tool: ToolDefinition; large?: boolean }) {
  return <ToolIconTile icon={tool.icon} accent={tool.accent} size={large ? "large" : "small"} />;
}

function CategoryIcon({ category }: { category: keyof typeof CATEGORY_ICONS }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon />;
}

/** Paste a link (it opens in its download tool) or drop files (the "Send to" picker suggests a tool). */
function QuickStart() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);
  const link = linkFromText(text);

  const open = () => link && openClipboardLink(link);
  const pickTool = (files: string[]) => useTransferStore.getState().openModal(files, undefined, "drop");
  const browse = async () => pickTool(await api.dialogs.openFiles([allFilesFilter(t)]));

  return (
    <section
      {...{ [DROP_ZONE_ATTR]: "" }}
      className={mergeClasses(styles.quick, over && styles.quickOver)}
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
        claimDrop(e, pickTool);
      }}
    >
      <span className={styles.quickIcon}>
        <Link24Regular />
      </span>
      <input
        className={styles.quickInput}
        value={text}
        placeholder={t("home.quickStartPlaceholder")}
        aria-label={t("home.quickStartPlaceholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && open()}
      />
      {link ? (
        <Button appearance="primary" icon={<ArrowRight16Regular />} iconPosition="after" onClick={open}>
          {t("home.quickStartOpen")}
        </Button>
      ) : (
        <Button appearance="subtle" icon={<DocumentAdd16Regular />} onClick={browse}>
          {t("home.quickStartBrowse")}
        </Button>
      )}
    </section>
  );
}

function RecentTools() {
  const styles = useStyles();
  const { t } = useTranslation();
  const tools = useRecentTools(useShallow((s) => s.ids.map(toolById).filter((tool): tool is ToolDefinition => !!tool)));
  if (tools.length === 0) return null;

  return (
    <Section title={t("home.recentTools")}>
      <div className={styles.recent}>
        {tools.map((tool) => (
          <button key={tool.id} type="button" className={styles.recentCard} onClick={() => navigate(tool.id)}>
            <ToolTile tool={tool} large />
            <Body1Strong>{t(`tools.${tool.id}.name`)}</Body1Strong>
          </button>
        ))}
      </div>
    </Section>
  );
}

function ToolGroups() {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <div className={styles.groups}>
      {CATEGORIES.map((category) => {
        const tools = TOOLS.filter((tool) => tool.category === category);
        if (tools.length === 0) return null;
        return (
          <section key={category} className={styles.group} aria-label={t(`categories.${category}`)}>
            <Text as="h2" weight="semibold" size={300} className={styles.groupTitle}>
              <span className={styles.groupIcon} style={{ color: CATEGORY_ACCENTS[category] }}>
                <CategoryIcon category={category} />
              </span>
              {t(`categories.${category}`)}
            </Text>
            {tools.map((tool) => (
              <button key={tool.id} type="button" className={styles.row} onClick={() => navigate(tool.id)}>
                <ToolTile tool={tool} />
                <span className={styles.rowText}>
                  <Body1Strong>{t(`tools.${tool.id}.name`)}</Body1Strong>
                  <Caption1 className={styles.description}>{t(`tools.${tool.id}.description`)}</Caption1>
                </span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const RECENT_LIMIT = 6;

function RecentJobs() {
  const styles = useStyles();
  const { t } = useTranslation();
  const jobs = useJobs(useShallow((s) => listedJobs(s).slice(0, RECENT_LIMIT)));
  const earlier = useJobs(useShallow((s) => earlierJobs(s.history, s.jobs).slice(0, Math.max(0, RECENT_LIMIT - jobs.length))));

  if (jobs.length === 0 && earlier.length === 0) {
    return (
      <div className={styles.empty}>
        <History24Regular />
        <Body1>{t("home.noJobs")}</Body1>
      </div>
    );
  }

  return (
    <div className={styles.jobs}>
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
      {earlier.map((entry) => (
        <HistoryJobCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <Page title={t("home.greeting")} description={t("home.subtitle")}>
      <QuickStart />
      <RecentTools />
      <ToolGroups />
      <Section title={t("home.recentJobs")}>
        <RecentJobs />
      </Section>
    </Page>
  );
}

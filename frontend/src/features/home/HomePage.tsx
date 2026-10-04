import {
  Body1,
  Caption1,
  Card,
  CardHeader,
  makeStyles,
  ProgressBar,
  Text,
  tokens,
} from "@fluentui/react-components";
import { ArrowRight16Regular, History24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { TOOLS, toolById } from "../../app/tools";
import { JobStatusBadge, jobMessage } from "../../components/JobStatusBadge";
import { Page, Section } from "../../components/Page";
import { navigate } from "../../lib/router";
import { useJobs } from "../../stores/jobs";

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: "12px",
  },
  card: {
    cursor: "pointer",
    height: "100%",
    transitionProperty: "transform, box-shadow",
    transitionDuration: tokens.durationFast,
    ":hover": { transform: "translateY(-2px)", boxShadow: tokens.shadow8 },
    ":hover .arrow": { opacity: 1, transform: "translateX(0)" },
  },
  tile: {
    width: "40px",
    height: "40px",
    borderRadius: tokens.borderRadiusLarge,
    display: "grid",
    placeItems: "center",
    color: "#fff",
    "& svg": { width: "22px", height: "22px" },
  },
  description: { color: tokens.colorNeutralForeground3 },
  category: { color: tokens.colorNeutralForeground3, textTransform: "uppercase", letterSpacing: "0.04em" },
  arrow: {
    opacity: 0,
    transform: "translateX(-4px)",
    transitionProperty: "opacity, transform",
    transitionDuration: tokens.durationFast,
    color: tokens.colorNeutralForeground3,
  },
  jobs: { display: "flex", flexDirection: "column", gap: "6px" },
  job: {
    display: "grid",
    gridTemplateColumns: "32px 1fr auto",
    alignItems: "center",
    gap: "12px",
    padding: "10px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  jobIcon: { color: tokens.colorNeutralForeground2, display: "grid", placeItems: "center" },
  jobText: { display: "flex", flexDirection: "column", minWidth: 0, gap: "4px" },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
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

function RecentJobs() {
  const styles = useStyles();
  const { t } = useTranslation();
  const jobs = useJobs(useShallow((s) => s.order.map((id) => s.jobs[id]).filter((j) => !j.dismissed).slice(0, 6)));

  if (jobs.length === 0) {
    return (
      <div className={styles.empty}>
        <History24Regular />
        <Body1>{t("home.noJobs")}</Body1>
      </div>
    );
  }

  return (
    <div className={styles.jobs}>
      {jobs.map((job) => {
        const toolId = job.kind.split(".")[0];
        const tool = toolById(toolId);
        const Icon = tool?.icon;
        return (
          <div key={job.id} className={styles.job} onClick={() => tool && navigate(tool.id)}>
            <span className={styles.jobIcon}>{Icon && <Icon />}</span>
            <div className={styles.jobText}>
              <Text weight="semibold" className={styles.ellipsis}>
                {tool ? t(`tools.${tool.id}.name`) : job.kind}
                {job.title && job.title !== job.kind ? ` · ${t(job.title)}` : ""}
              </Text>
              {job.status === "running" ? (
                <ProgressBar value={job.percent == null ? undefined : job.percent / 100} thickness="medium" />
              ) : (
                <Caption1 className={styles.ellipsis}>{jobMessage(t, job)}</Caption1>
              )}
            </div>
            <JobStatusBadge status={job.status} />
          </div>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    <Page title={t("home.greeting")} description={t("home.subtitle")}>
      <Section title={t("home.allTools")}>
        <div className={styles.grid}>
          {TOOLS.map((tool) => (
            <Card key={tool.id} className={styles.card} onClick={() => navigate(tool.id)} focusMode="off" role="link" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && navigate(tool.id)}>
              <CardHeader
                image={
                  <div className={styles.tile} style={{ background: `linear-gradient(135deg, ${tool.accent}, ${tool.accent}bb)` }}>
                    <tool.icon />
                  </div>
                }
                header={<Text weight="semibold">{t(`tools.${tool.id}.name`)}</Text>}
                description={<Caption1 className={styles.category}>{t(`categories.${tool.category}`)}</Caption1>}
                action={<ArrowRight16Regular className={`${styles.arrow} arrow`} />}
              />
              <Body1 className={styles.description}>{t(`tools.${tool.id}.description`)}</Body1>
            </Card>
          ))}
        </div>
      </Section>
      <Section title={t("home.recentJobs")}>
        <RecentJobs />
      </Section>
    </Page>
  );
}

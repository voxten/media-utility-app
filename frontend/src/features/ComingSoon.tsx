import { Body1, makeStyles, Subtitle1, tokens } from "@fluentui/react-components";
import { WrenchScrewdriver24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { toolById } from "../app/tools";
import { Page } from "../components/Page";

const useStyles = makeStyles({
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "64px 24px",
    textAlign: "center",
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    "& svg": { width: "40px", height: "40px" },
  },
});

export default function ComingSoon({ toolId }: { toolId: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const tool = toolById(toolId)!;
  return (
    <Page title={t(`tools.${tool.id}.name`)} description={t(`tools.${tool.id}.description`)} icon={tool.icon} accent={tool.accent}>
      <div className={styles.empty}>
        <WrenchScrewdriver24Regular />
        <Subtitle1>{t("common.comingSoonTitle")}</Subtitle1>
        <Body1>{t("common.comingSoon")}</Body1>
      </div>
    </Page>
  );
}

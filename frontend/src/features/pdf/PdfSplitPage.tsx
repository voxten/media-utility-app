import { useMemo, useState } from "react";
import { Button, Caption1, Field, makeStyles, Radio, RadioGroup, tokens, ToggleButton, Tooltip } from "@fluentui/react-components";
import { Add16Regular, Delete16Regular } from "@fluentui/react-icons";
import { DocumentSplit24Regular } from "../../app/customIcons";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../components/notify";
import { ToolPage } from "../../components/Page";
import { ResultCard } from "../../components/ResultCard";
import { api } from "../../lib/bridge";
import { useJobRunner } from "../../lib/useJobRunner";
import { useIncomingTransfer } from "../../lib/useIncomingTransfer";
import { GROUP_COLORS, groupColor } from "./groupColors";
import type { PageMark } from "./PdfPageGrid";
import { SinglePdfTool } from "./SinglePdfTool";
import { errorMessage } from "../../lib/errors";

interface SplitResult {
  files: string[];
  count: number;
  outDir: string;
}

type SplitMode = "all" | "groups";

/** One output file: its colour slot (kept when other groups are removed) and 0-based pages in order. */
interface SplitGroup {
  color: number;
  pages: number[];
}

const FIRST_GROUP: SplitGroup[] = [{ color: 0, pages: [] }];

const useStyles = makeStyles({
  muted: { color: tokens.colorNeutralForeground3 },
  swatch: { width: "10px", height: "10px", borderRadius: "50%" },
});

export default function PdfSplitPage() {
  const { t } = useTranslation();
  const styles = useStyles();
  const notify = useNotify();

  const [file, setFile] = useState<string | null>(null);
  const [mode, setMode] = useState<SplitMode>("all");
  const [groups, setGroups] = useState<SplitGroup[]>(FIRST_GROUP);
  const [active, setActive] = useState(0);
  const [lastPage, setLastPage] = useState<number | null>(null);

  const split = useJobRunner<SplitResult>("pdf.split", {
    onError: (error) => notify.error(t("pdf.toast.splitError"), { body: error }),
  });

  const changeFile = (next: string | null) => {
    setFile(next);
    setGroups(FIRST_GROUP);
    setActive(0);
    setLastPage(null);
    split.reset();
  };

  useIncomingTransfer("pdf_split", (files) => {
    if (files[0]) changeFile(files[0]);
  });

  const marks = useMemo(() => {
    const map = new Map<number, PageMark>();
    if (mode !== "groups") return map;
    groups.forEach((group, i) => {
      for (const page of group.pages) map.set(page, { color: groupColor(group.color), label: `${i + 1}` });
    });
    return map;
  }, [mode, groups]);

  const togglePage = (page: number, extend: boolean) => {
    const anchor = extend && mode === "groups" ? lastPage : null;
    const targets =
      anchor === null
        ? [page]
        : Array.from({ length: Math.abs(page - anchor) + 1 }, (_, i) => Math.min(page, anchor) + i);
    const removing = anchor === null && mode === "groups" && groups[active].pages.includes(page);
    setGroups(
      groups.map((group, i) => {
        const rest = group.pages.filter((p) => !targets.includes(p));
        if (i !== active || removing) return { ...group, pages: rest };
        return { ...group, pages: [...rest, ...targets].sort((a, b) => a - b) };
      }),
    );
    setMode("groups");
    setLastPage(page);
  };

  const addGroup = () => {
    const used = new Set(groups.map((g) => g.color));
    const free = GROUP_COLORS.findIndex((_, i) => !used.has(i));
    setGroups([...groups, { color: free >= 0 ? free : groups.length, pages: [] }]);
    setActive(groups.length);
  };

  const removeGroup = () => {
    if (groups.length === 1) {
      setGroups(FIRST_GROUP);
      return;
    }
    setGroups(groups.filter((_, i) => i !== active));
    setActive(Math.max(0, active - 1));
  };

  const outputGroups = groups.map((g) => g.pages).filter((pages) => pages.length);

  const start = async () => {
    if (!file) return;
    const outDir = await api.dialogs.openFolder();
    if (!outDir) return;
    split.start(() => api.pdf.split(file, outDir, mode, outputGroups)).catch((err) => notify.error(errorMessage(t, err)));
  };

  const toolbar = mode === "groups" && (
    <>
      {groups.map((group, i) => (
        <ToggleButton
          key={i}
          size="small"
          appearance="subtle"
          checked={i === active}
          icon={<span className={styles.swatch} style={{ backgroundColor: groupColor(group.color) }} />}
          onClick={() => setActive(i)}
        >
          {t("pdf.split.group", { n: i + 1 })}
        </ToggleButton>
      ))}
      <Button size="small" appearance="subtle" icon={<Add16Regular />} onClick={addGroup}>
        {t("pdf.split.newGroup")}
      </Button>
      <Tooltip content={t("pdf.split.removeGroup")} relationship="label">
        <Button
          size="small"
          appearance="subtle"
          icon={<Delete16Regular />}
          disabled={groups.length === 1 && !groups[0].pages.length}
          onClick={removeGroup}
        />
      </Tooltip>
    </>
  );

  return (
    <ToolPage toolId="pdf_split">
      <SinglePdfTool
        toolId="pdf_split"
        file={file}
        onFileChange={changeFile}
        job={split.job}
        onCancel={split.cancel}
        action={
          <Button
            appearance="primary"
            icon={<DocumentSplit24Regular />}
            disabled={!file || split.running || (mode === "groups" && !outputGroups.length)}
            onClick={start}
          >
            {t("pdf.split.action")}
          </Button>
        }
        pageMarks={{ marks, onToggle: togglePage, toolbar }}
        result={
          split.result && (
            <ResultCard
              title={t("pdf.toast.splitSuccess", { count: split.result.count })}
              path={split.result.outDir}
              folder
              files={split.result.files}
              sourceToolId="pdf_split"
            />
          )
        }
      >
        <Field label={t("pdf.split.mode")}>
          <RadioGroup value={mode} onChange={(_, d) => setMode(d.value as SplitMode)}>
            <Radio value="all" label={t("pdf.split.modeAll")} />
            <Radio value="groups" label={t("pdf.split.modeGroups")} />
          </RadioGroup>
        </Field>
        {mode === "groups" && <Caption1 className={styles.muted}>{t("pdf.split.groupsHint")}</Caption1>}
      </SinglePdfTool>
    </ToolPage>
  );
}

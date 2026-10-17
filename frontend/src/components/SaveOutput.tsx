// Output folder + file name for tools that produce one result file, with the "Save" / "Save as…" logic.

import { useState } from "react";
import { Field, Input, makeStyles } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { api } from "../lib/bridge";
import { dirName, fileName, joinPath } from "../lib/format";
import { useSettings } from "../stores/settings";
import { useNotify } from "./notify";
import { PathPicker } from "./PathPicker";

const useStyles = makeStyles({
  row: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" },
  dir: { flex: "1 1 280px", minWidth: 0 },
  name: { width: "240px" },
});

export interface SaveOutput {
  dir: string;
  name: string;
  setDir: (dir: string) => void;
  setName: (name: string) => void;
  canSave: boolean;
  /** Points the fields at the source file's folder (or the default output folder) with a suggested name. */
  reset: (sourcePath: string, defaultName: string) => void;
  saveHere: (resultPath: string) => Promise<void>;
  saveAs: (resultPath: string, fileTypes: string[]) => Promise<void>;
}

export function useSaveOutput(save: (resultPath: string, target: string) => Promise<string>): SaveOutput {
  const { t } = useTranslation();
  const notify = useNotify();
  const defaultDir = useSettings((s) => s.settings?.outputDir);
  const [dir, setDir] = useState("");
  const [name, setName] = useState("");

  const write = async (resultPath: string, target: string) => {
    try {
      const saved = await save(resultPath, target);
      notify.success(t("common.savedSuccess"), {
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(saved).catch(() => undefined) },
      });
    } catch (err) {
      notify.error(t("common.saveError"), { body: String(err) });
    }
  };

  return {
    dir,
    name,
    setDir,
    setName,
    canSave: !!dir.trim() && !!name.trim(),
    reset: (sourcePath, defaultName) => {
      setDir(dirName(sourcePath) || defaultDir || "");
      setName(defaultName);
    },
    saveHere: (resultPath) => write(resultPath, joinPath(dir.trim(), name.trim())),
    saveAs: async (resultPath, fileTypes) => {
      const target = await api.dialogs.saveFile(name, fileTypes, dir);
      if (!target) return;
      // The dialog may drop the extension; keep the one from the suggested name.
      const ext = name.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
      await write(resultPath, /\.[a-z0-9]+$/i.test(fileName(target)) ? target : `${target}${ext}`);
    },
  };
}

export function SaveOutputFields({ output }: { output: SaveOutput }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <div className={styles.row}>
      <Field label={t("common.outputFolder")} className={styles.dir}>
        <PathPicker value={output.dir} onChange={output.setDir} mode="folder" openable />
      </Field>
      <Field label={t("common.fileName")} className={styles.name}>
        <Input value={output.name} onChange={(_, d) => output.setName(d.value)} />
      </Field>
    </div>
  );
}

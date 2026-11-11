// Output folder + file name for tools that produce one result file, with the "Save" / "Save as…" logic.

import { Field, Input, makeStyles } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { api } from "../lib/bridge";
import { fileName, joinPath } from "../lib/format";
import { confirm } from "./ConfirmDialog";
import { useNotify } from "./notify";
import { OutputFolderField, useOutputDir } from "./OutputFolderField";
import { errorMessage } from "../lib/errors";

const useStyles = makeStyles({
  row: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" },
  dir: { flex: "1 1 280px", minWidth: 0 },
  name: { width: "240px" },
});

/** Folder ("" = the default output folder) and file name per tool, kept across page switches. */
const useSaveTargets = create<Record<string, { dir: string; name: string }>>(() => ({}));

export interface SaveOutput {
  /** Folder picked in the tool; "" means the default output folder. */
  pickedDir: string;
  name: string;
  setDir: (dir: string) => void;
  setName: (name: string) => void;
  canSave: boolean;
  /** Suggests a file name for a new result; the folder stays as picked. */
  reset: (defaultName: string) => void;
  saveHere: (resultPath: string) => Promise<void>;
  saveAs: (resultPath: string, fileTypes: string[]) => Promise<void>;
}

export function useSaveOutput(toolId: string, save: (resultPath: string, target: string) => Promise<string>): SaveOutput {
  const { t } = useTranslation();
  const notify = useNotify();
  const target = useSaveTargets((s) => s[toolId]);
  const pickedDir = target?.dir ?? "";
  const name = target?.name ?? "";
  const dir = useOutputDir(pickedDir);
  const update = (patch: Partial<{ dir: string; name: string }>) =>
    useSaveTargets.setState((s) => ({ [toolId]: { ...(s[toolId] ?? { dir: "", name: "" }), ...patch } }));

  const write = async (resultPath: string, path: string) => {
    try {
      const saved = await save(resultPath, path);
      notify.success(t("common.savedSuccess"), {
        action: { label: t("common.showInFolder"), onClick: () => api.system.reveal(saved).catch(() => undefined) },
      });
    } catch (err) {
      notify.error(t("common.saveError"), { body: errorMessage(t, err) });
    }
  };

  return {
    pickedDir,
    name,
    setDir: (next) => update({ dir: next }),
    setName: (next) => update({ name: next }),
    canSave: !!dir.trim() && !!name.trim(),
    reset: (defaultName) => update({ name: defaultName }),
    saveHere: async (resultPath) => {
      const path = joinPath(dir.trim(), name.trim());
      const existing = await api.system.pathInfo(path).catch(() => null);
      if (existing?.exists) {
        const ok = await confirm({ title: t("common.replaceTitle"), body: t("common.replaceBody", { name: fileName(path) }), confirmLabel: t("common.replace") });
        if (!ok) return;
      }
      await write(resultPath, path);
    },
    saveAs: async (resultPath, fileTypes) => {
      const picked = await api.dialogs.saveFile(name, fileTypes, dir);
      if (!picked) return;
      // The dialog may drop the extension; keep the one from the suggested name.
      const ext = name.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
      await write(resultPath, /\.[a-z0-9]+$/i.test(fileName(picked)) ? picked : `${picked}${ext}`);
    },
  };
}

export function SaveOutputFields({ output }: { output: SaveOutput }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <div className={styles.row}>
      <OutputFolderField className={styles.dir} value={output.pickedDir} onChange={output.setDir} />
      <Field label={t("common.fileName")} className={styles.name}>
        <Input value={output.name} onChange={(_, d) => output.setName(d.value)} />
      </Field>
    </div>
  );
}

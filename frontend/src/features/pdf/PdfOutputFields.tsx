import { Field, Input, makeStyles } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { OutputFolderField } from "../../components/OutputFolderField";

const useStyles = makeStyles({
  row: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" },
  dir: { flex: "1 1 280px", minWidth: 0 },
  name: { width: "240px" },
});

/** `name` (or `fallback` when empty) with its extension replaced by .pdf. */
export function pdfName(name: string, fallback: string): string {
  return `${(name.trim() || fallback).replace(/\.[^./\\]*$/, "")}.pdf`;
}

interface PdfOutputFieldsProps {
  dir: string;
  onDirChange: (dir: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  defaultName: string;
}

export function PdfOutputFields({ dir, onDirChange, name, onNameChange, defaultName }: PdfOutputFieldsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <OutputFolderField value={dir} onChange={onDirChange} className={styles.dir} />
      <Field label={t("common.fileName")} className={styles.name}>
        <Input value={name} placeholder={defaultName} onChange={(_, d) => onNameChange(d.value)} />
      </Field>
    </div>
  );
}

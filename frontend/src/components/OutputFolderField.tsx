import { Field } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { useSettings } from "../stores/settings";
import { PathPicker } from "./PathPicker";

/** The folder a tool writes to: the one picked in the tool, else the default output folder from Settings. */
export function useOutputDir(picked: string): string {
  const fallback = useSettings((s) => s.settings?.outputDir ?? "");
  return picked || fallback;
}

interface OutputFolderFieldProps {
  value: string;
  onChange: (dir: string) => void;
  className?: string;
}

export function OutputFolderField({ value, onChange, className }: OutputFolderFieldProps) {
  const { t } = useTranslation();
  const dir = useOutputDir(value);
  return (
    <Field label={t("common.outputFolder")} className={className}>
      <PathPicker value={dir} onChange={onChange} openable />
    </Field>
  );
}

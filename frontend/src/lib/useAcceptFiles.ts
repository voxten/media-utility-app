// Keeps the files a tool can open and says how many of the dropped or chosen ones it skipped.

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../components/notify";
import { matchesExtensions } from "./drop";

export function useAcceptFiles(extensions: string[]): (paths: string[]) => string[] {
  const { t } = useTranslation();
  const notify = useNotify();
  return useCallback(
    (paths: string[]) => {
      const accepted = paths.filter((p) => matchesExtensions(p, extensions));
      const skipped = paths.length - accepted.length;
      if (skipped > 0) notify.warning(t("common.skippedFiles", { count: skipped }));
      return accepted;
    },
    [extensions, notify, t],
  );
}

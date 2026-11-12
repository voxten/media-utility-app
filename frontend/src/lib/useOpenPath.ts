import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../components/notify";
import { api } from "./bridge";
import { errorMessage } from "./errors";

/** Opening a file or showing it in Explorer, with a toast when the file is gone or Windows refuses. */
export function useOpenPath() {
  const { t } = useTranslation();
  const notify = useNotify();
  return useMemo(() => {
    const report = (err: unknown) => notify.error(errorMessage(t, err));
    return {
      openPath: (path: string) => void api.system.openPath(path).catch(report),
      reveal: (path: string) => void api.system.reveal(path).catch(report),
    };
  }, [t, notify]);
}

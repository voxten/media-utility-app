import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../components/notify";
import { useTransferStore } from "../stores/transfer";

/**
 * Hands files sent to this tool to `onAccept`: on opening the page, and also while the page is
 * already open (sending to the current tool does not navigate, so there is no new mount).
 */
export function useIncomingTransfer(
  toolId: string,
  onAccept: (files: string[], subTab?: string) => void,
) {
  const pending = useTransferStore((s) => (s.pendingTransfer?.targetToolId === toolId ? s.pendingTransfer : null));
  const consumeTransfer = useTransferStore((s) => s.consumeTransfer);
  const notify = useNotify();
  const { t } = useTranslation();
  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;

  useEffect(() => {
    if (!pending) return;
    const payload = consumeTransfer(toolId);
    if (!payload || !payload.files.length) return;

    onAcceptRef.current(payload.files, payload.targetSubTab);

    const sourceName = payload.sourceToolId ? t(`tools.${payload.sourceToolId}.name`) : null;
    notify.info(
      sourceName
        ? t("transfer.toastLoadedFrom", { source: sourceName })
        : t("transfer.toastLoaded"),
    );
  }, [pending, toolId, consumeTransfer, notify, t]);
}

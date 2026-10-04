import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../components/notify";
import { useTransferStore } from "../stores/transfer";

/**
 * Hook enabling a tool page to automatically receive files transferred from other tools.
 * When the page mounts or becomes active, if a pending transfer matches this toolId,
 * the transfer payload is consumed, onAccept is called with the file paths and optional subTab,
 * and an informative notification is displayed.
 */
export function useIncomingTransfer(
  toolId: string,
  onAccept: (files: string[], subTab?: string) => void,
) {
  const consumeTransfer = useTransferStore((s) => s.consumeTransfer);
  const notify = useNotify();
  const { t } = useTranslation();
  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;

  useEffect(() => {
    const payload = consumeTransfer(toolId);
    if (!payload || !payload.files.length) return;

    onAcceptRef.current(payload.files, payload.targetSubTab);

    const sourceName = payload.sourceToolId ? t(`tools.${payload.sourceToolId}.name`) : null;
    notify.info(
      sourceName
        ? t("transfer.toastLoadedFrom", { source: sourceName })
        : t("transfer.toastLoaded"),
    );
  }, [toolId, consumeTransfer, notify, t]);
}

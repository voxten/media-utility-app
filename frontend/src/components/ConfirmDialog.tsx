// Promise-based confirmation dialog: `if (await confirm({ title, body })) ...`.
// A single <ConfirmHost /> is mounted in the shell.

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { create } from "zustand";

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

export function confirm(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...options, resolve } }));
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const request = useConfirmStore((s) => s.request);
  const close = (ok: boolean) => {
    request?.resolve(ok);
    useConfirmStore.setState({ request: null });
  };

  return (
    <Dialog open={!!request} onOpenChange={(_, data) => !data.open && close(false)} modalType="alert">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.body && <DialogContent style={{ wordBreak: "break-word" }}>{request.body}</DialogContent>}
          <DialogActions>
            <Button appearance="secondary" onClick={() => close(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              appearance="primary"
              onClick={() => close(true)}
              style={request?.danger ? { backgroundColor: "var(--colorPaletteRedBackground3)" } : undefined}
            >
              {request?.confirmLabel ?? t("common.ok")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

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
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { create } from "zustand";

const useStyles = makeStyles({
  body: { wordBreak: "break-word" },
  danger: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    ":hover": { backgroundColor: tokens.colorPaletteRedForeground1 },
  },
});

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

// `request` outlives `open` so the dialog keeps its text while it animates out.
const useConfirmStore = create<{ open: boolean; request: ConfirmRequest | null }>(() => ({ open: false, request: null }));

export function confirm(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ open: true, request: { ...options, resolve } }));
}

export function ConfirmHost() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { open, request } = useConfirmStore();
  const close = (ok: boolean) => {
    if (!open) return;
    request?.resolve(ok);
    useConfirmStore.setState({ open: false });
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && close(false)} modalType="alert">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.body && <DialogContent className={styles.body}>{request.body}</DialogContent>}
          <DialogActions>
            <Button appearance="secondary" onClick={() => close(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              appearance="primary"
              className={request?.danger ? styles.danger : undefined}
              onClick={() => close(true)}
            >
              {request?.confirmLabel ?? t("common.ok")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

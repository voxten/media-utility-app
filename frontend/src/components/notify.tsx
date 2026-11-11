import { useCallback, useMemo } from "react";
import {
  Link,
  Toast,
  ToastBody,
  ToastFooter,
  ToastTitle,
  useToastController,
  type ToastIntent,
} from "@fluentui/react-components";

export const TOASTER_ID = "app-toaster";

interface NotifyOptions {
  body?: string;
  action?: { label: string; onClick: () => void };
  timeout?: number;
}

/** Fluent toasts with one call: notify.success("Saved", { action: {...} }). */
let toastCounter = 0;

export function useNotify() {
  const { dispatchToast, dismissToast } = useToastController(TOASTER_ID);

  const show = useCallback(
    (intent: ToastIntent, title: string, { body, action, timeout }: NotifyOptions = {}) => {
      const toastId = `toast-${++toastCounter}`;
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
          {action && (
            <ToastFooter>
              <Link
                onClick={() => {
                  dismissToast(toastId);
                  action.onClick();
                }}
              >
                {action.label}
              </Link>
            </ToastFooter>
          )}
        </Toast>,
        { toastId, intent, timeout: timeout ?? (intent === "error" ? 8000 : 5000) },
      );
    },
    [dispatchToast, dismissToast],
  );

  return useMemo(
    () => ({
      success: (title: string, options?: NotifyOptions) => show("success", title, options),
      error: (title: string, options?: NotifyOptions) => show("error", title, options),
      warning: (title: string, options?: NotifyOptions) => show("warning", title, options),
      info: (title: string, options?: NotifyOptions) => show("info", title, options),
    }),
    [show],
  );
}

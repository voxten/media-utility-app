import { useCallback } from "react";
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
export function useNotify() {
  const { dispatchToast } = useToastController(TOASTER_ID);

  const show = useCallback(
    (intent: ToastIntent, title: string, { body, action, timeout }: NotifyOptions = {}) =>
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
          {action && (
            <ToastFooter>
              <Link onClick={action.onClick}>{action.label}</Link>
            </ToastFooter>
          )}
        </Toast>,
        { intent, timeout: timeout ?? (intent === "error" ? 8000 : 5000) },
      ),
    [dispatchToast],
  );

  return {
    success: (title: string, options?: NotifyOptions) => show("success", title, options),
    error: (title: string, options?: NotifyOptions) => show("error", title, options),
    warning: (title: string, options?: NotifyOptions) => show("warning", title, options),
    info: (title: string, options?: NotifyOptions) => show("info", title, options),
  };
}

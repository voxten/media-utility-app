import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, on } from "../lib/bridge";
import { useEngines } from "../stores/engines";
import { useJob } from "../stores/jobs";
import { useNotify } from "./notify";

/** Offers download engine updates found at start-up and reports how an update went. */
export function EngineUpdateHost() {
  const { t } = useTranslation();
  const notify = useNotify();
  const jobId = useEngines((s) => s.jobId);
  const job = useJob(jobId);
  const reported = useRef<string | null>(null);

  useEffect(
    () =>
      on("engines:update", ({ engines }) => {
        useEngines.getState().load().catch(() => undefined);
        notify.info(t("engines.available"), {
          body: engines.map((e) => `${e.id} ${e.latest}`).join(", "),
          action: {
            label: t("engines.update"),
            onClick: () => {
              useEngines.getState().update().catch((err) => notify.error(t("engines.failed"), { body: String(err) }));
            },
          },
          timeout: 15000,
        });
      }),
    [notify, t],
  );

  useEffect(() => {
    if (!job || job.status === "running" || reported.current === job.id) return;
    reported.current = job.id;
    if (job.status === "done") {
      useEngines.getState().load().catch(() => undefined);
      notify.success(t("engines.updated"), {
        action: { label: t("engines.restart"), onClick: () => api.system.restart().catch(() => undefined) },
        timeout: 15000,
      });
    } else if (job.status === "error") {
      notify.error(t("engines.failed"), { body: job.error ?? undefined });
    }
  }, [job, notify, t]);

  return null;
}

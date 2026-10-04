// Toasts for jobs that finish while the user is on another page (the tool page's own
// useJobRunner callbacks only fire while that page is mounted).

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../components/notify";
import { on } from "../lib/bridge";
import { navigate } from "../lib/router";
import { useJobs } from "../stores/jobs";
import { toolById } from "./tools";

// Short helper jobs (link probing, page thumbnails) are part of a page interaction, not worth a toast.
const QUIET_KINDS = new Set(["download.probe", "pdf.inspect"]);

export function useJobNotifications(route: string) {
  const { t } = useTranslation();
  const notify = useNotify();
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const handle = (jobId: string, ok: boolean, error?: string) => {
      const job = useJobs.getState().jobs[jobId];
      if (!job || QUIET_KINDS.has(job.kind)) return;
      const tool = toolById(job.kind.split(".")[0]);
      if (!tool || routeRef.current === tool.id) return;
      const name = t(`tools.${tool.id}.name`);
      const options = {
        body: ok ? (job.title ? t(job.title) : undefined) : error,
        action: { label: t("jobs.openTool"), onClick: () => navigate(tool.id) },
      };
      if (ok) notify.success(t("jobs.toastDone", { tool: name }), options);
      else notify.error(t("jobs.toastError", { tool: name }), options);
    };
    const offDone = on("job:done", ({ jobId }) => handle(jobId, true));
    const offError = on("job:error", ({ jobId, error }) => handle(jobId, false, error));
    return () => {
      offDone();
      offError();
    };
  }, [t, notify]);
}

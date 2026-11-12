// The install of one optional dependency, shared by the tool banners and Settings → Dependencies.

import { useEffect, useRef, useState } from "react";
import i18n from "../i18n";
import { api } from "./bridge";
import { errorMessage } from "./errors";
import { jobMessage } from "./jobMessage";
import { useJob, useJobs } from "../stores/jobs";

interface InstallCallbacks {
  onInstalled?: () => void;
  /** `message` is the translated reason. */
  onFailed?: (message: string) => void;
}

const installTitle = (depId: string) => `deps.installTitle.${depId}`;

/**
 * Finds an install of `depId` that is already running, wherever it was started, so leaving and
 * returning to a page shows its progress instead of offering a second download. Each callback runs
 * once per install job.
 */
export function useInstallJob(depId: string, callbacks: InstallCallbacks = {}) {
  const title = installTitle(depId);
  const runningId = useJobs(
    (state) => Object.values(state.jobs).find((job) => job.status === "running" && job.title === title)?.id ?? null,
  );
  const [watchedId, setWatchedId] = useState<string | null>(null);
  const job = useJob(watchedId ?? runningId);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (runningId) setWatchedId(runningId);
  }, [runningId]);

  useEffect(() => {
    if (!job || job.status === "running" || handledRef.current === job.id) return;
    handledRef.current = job.id;
    if (job.status === "done") callbacksRef.current.onInstalled?.();
    else if (job.status === "error") callbacksRef.current.onFailed?.(jobMessage(i18n.t, job));
  }, [job]);

  const install = async () => {
    try {
      setWatchedId(await api.system.installDependency(depId));
    } catch (err) {
      callbacksRef.current.onFailed?.(errorMessage(i18n.t, err));
    }
  };

  const cancel = () => {
    if (job?.status === "running") api.jobs.cancel(job.id).catch(() => undefined);
  };

  return { job: job?.status === "running" ? job : undefined, install, cancel };
}

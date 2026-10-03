// Per-page handle on one backend job: start it, follow it, cancel it, react when it ends.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type JobId } from "./bridge";
import { useJob, type JobState } from "../stores/jobs";

interface JobRunnerOptions<T> {
  onDone?: (result: T, job: JobState) => void;
  onError?: (error: string, job: JobState) => void;
  onCancelled?: (job: JobState) => void;
}

// Job ids per page survive navigation, so returning to a tool shows its running job.
const lastJobByKey = new Map<string, JobId>();

export function useJobRunner<T = unknown>(key: string, options: JobRunnerOptions<T> = {}) {
  const [jobId, setJobId] = useState<JobId | null>(() => lastJobByKey.get(key) ?? null);
  const [starting, setStarting] = useState(false);
  const job = useJob(jobId);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const handledRef = useRef<string | null>(null);

  // Fire completion callbacks once per job (and not for jobs that ended while the page was away).
  const mountedAt = useRef(Date.now() / 1000);
  useEffect(() => {
    if (!job || job.status === "running" || handledRef.current === job.id) return;
    handledRef.current = job.id;
    if ((job.finishedAt ?? 0) < mountedAt.current) return;
    const opts = optionsRef.current;
    if (job.status === "done") opts.onDone?.(job.result as T, job);
    else if (job.status === "error") opts.onError?.(job.error ?? "", job);
    else if (job.status === "cancelled") opts.onCancelled?.(job);
  }, [job]);

  const start = useCallback(
    async (launch: () => Promise<JobId>) => {
      setStarting(true);
      try {
        const id = await launch();
        mountedAt.current = 0; // a job started from this page always reports back
        lastJobByKey.set(key, id);
        setJobId(id);
        return id;
      } finally {
        setStarting(false);
      }
    },
    [key],
  );

  const cancel = useCallback(() => {
    if (jobId) api.jobs.cancel(jobId).catch(() => undefined);
  }, [jobId]);

  const reset = useCallback(() => {
    lastJobByKey.delete(key);
    setJobId(null);
  }, [key]);

  return {
    job,
    jobId,
    start,
    cancel,
    reset,
    running: starting || job?.status === "running",
    result: job?.status === "done" ? (job.result as T) : undefined,
  };
}

export type JobRunner<T = unknown> = ReturnType<typeof useJobRunner<T>>;

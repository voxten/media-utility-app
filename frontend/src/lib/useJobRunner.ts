// Per-page handle on one backend job: start it, follow it, cancel it, react when it ends.

import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "../i18n";
import { api, type JobId } from "./bridge";
import { jobMessage } from "./jobMessage";
import { useJob, type JobState } from "../stores/jobs";

interface JobRunnerOptions<T> {
  /** Stores the result in page state: runs once per job, also for a job that ended while the page was closed. */
  onResult?: (result: T, job: JobState) => void;
  /** Feedback such as toasts: only for a job that ended while the page was open. */
  onDone?: (result: T, job: JobState) => void;
  /** `message` is the translated reason, ready for a toast. */
  onError?: (message: string, job: JobState) => void;
  onCancelled?: (job: JobState) => void;
}

// Job ids per page survive navigation, so returning to a tool shows its running job.
const lastJobByKey = new Map<string, JobId>();
// Kept outside the component: a result cleared by the user must not come back on the next visit.
const appliedResults = new Set<JobId>();

export function useJobRunner<T = unknown>(key: string, options: JobRunnerOptions<T> = {}) {
  const [jobId, setJobId] = useState<JobId | null>(() => lastJobByKey.get(key) ?? null);
  const [starting, setStarting] = useState(false);
  const job = useJob(jobId);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const handledRef = useRef<string | null>(null);

  // Completion callbacks fire once per job; feedback callbacks skip jobs that ended while the page was away.
  const mountedAt = useRef(Date.now() / 1000);
  useEffect(() => {
    if (!job || job.status === "running" || handledRef.current === job.id) return;
    handledRef.current = job.id;
    const opts = optionsRef.current;
    if (job.status === "done" && !appliedResults.has(job.id)) {
      appliedResults.add(job.id);
      opts.onResult?.(job.result as T, job);
    }
    if ((job.finishedAt ?? 0) < mountedAt.current) return;
    if (job.status === "done") opts.onDone?.(job.result as T, job);
    else if (job.status === "error") opts.onError?.(jobMessage(i18n.t, job), job);
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

// Page thumbnails of one PDF, rendered by the backend's pdf.inspect job and kept per file for the session.

import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { useJob } from "../../stores/jobs";

export interface PdfPageInfo {
  file: string;
  fileName: string;
  /** 0-based page index. */
  page: number;
  thumb: string;
  width: number;
  height: number;
}

const cache = new Map<string, PdfPageInfo[]>();

export function usePdfPages(file: string | null) {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const cached = file ? cache.get(file) : undefined;

  useEffect(() => {
    setJobId(null);
    if (!file || cache.has(file)) return;
    let live = true;
    let started: string | null = null;
    api.pdf
      .inspect([file])
      .then((id) => {
        started = id;
        if (live) setJobId(id);
        else api.jobs.cancel(id).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      // Switching files mid-render stops the old job instead of letting it finish unseen.
      if (started) api.jobs.cancel(started).catch(() => undefined);
    };
  }, [file]);

  const finished = job?.status === "done" ? (job.result as { pages: PdfPageInfo[] }).pages : undefined;
  useEffect(() => {
    if (file && finished) cache.set(file, finished);
  }, [file, finished]);

  return {
    pages: cached ?? finished ?? ((job?.partials ?? []) as PdfPageInfo[]),
    loading: !!file && !cached && job?.status !== "done" && job?.status !== "error",
    error: job?.status === "error" ? job.error : null,
  };
}

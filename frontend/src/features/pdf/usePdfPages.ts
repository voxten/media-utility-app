// Page thumbnails of one PDF, rendered by the backend's pdf.inspect job and kept per file for the session.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/bridge";
import { errorMessage } from "../../lib/errors";
import { jobMessage, translateMessage } from "../../lib/jobMessage";
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

interface InspectResult {
  pages: PdfPageInfo[];
  errors: { file: string; error: string }[];
}

/** Files whose thumbnails stay in memory; reopening an older one renders it again. */
const CACHE_FILES = 20;
const cache = new Map<string, PdfPageInfo[]>();

function remember(file: string, pages: PdfPageInfo[]) {
  cache.delete(file);
  cache.set(file, pages);
  for (const oldest of cache.keys()) {
    if (cache.size <= CACHE_FILES) break;
    cache.delete(oldest);
  }
}

export function usePdfPages(file: string | null) {
  const { t } = useTranslation();
  const [jobId, setJobId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const job = useJob(jobId);
  const cached = file ? cache.get(file) : undefined;

  useEffect(() => {
    setJobId(null);
    setFailed(null);
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
      .catch((err) => live && setFailed(errorMessage(t, err)));
    return () => {
      live = false;
      // Switching files mid-render stops the old job instead of letting it finish unseen.
      if (started) api.jobs.cancel(started).catch(() => undefined);
    };
  }, [file, t]);

  const result = job?.status === "done" ? (job.result as InspectResult) : undefined;
  const finished = result?.pages;
  useEffect(() => {
    if (file && finished?.length) remember(file, finished);
  }, [file, finished]);

  const unreadable = result && !result.pages.length && result.errors[0] ? translateMessage(t, result.errors[0].error) : null;
  const error = failed ?? (job?.status === "error" ? jobMessage(t, job) : unreadable);
  return {
    pages: cached ?? finished ?? ((job?.partials ?? []) as PdfPageInfo[]),
    loading: !!file && !cached && !error && (!job || job.status === "running"),
    error,
  };
}

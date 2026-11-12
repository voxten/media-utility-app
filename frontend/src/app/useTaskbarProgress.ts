// Mirrors the running jobs on the app's taskbar button: their average progress, or a moving bar
// while none of them reports a percentage.

import { useEffect } from "react";
import { api } from "../lib/bridge";
import { useJobs, type JobState } from "../stores/jobs";

export type TaskbarState = "none" | "indeterminate" | "normal";

export function taskbarProgress(jobs: JobState[]): { state: TaskbarState; value: number } {
  const running = jobs.filter((job) => job.status === "running");
  if (!running.length) return { state: "none", value: 0 };
  const known = running.map((job) => job.percent).filter((p): p is number => p != null);
  if (!known.length) return { state: "indeterminate", value: 0 };
  return { state: "normal", value: Math.round(known.reduce((sum, p) => sum + p, 0) / known.length) };
}

export function useTaskbarProgress() {
  useEffect(() => {
    let last = "";
    const apply = (jobs: Record<string, JobState>) => {
      const { state, value } = taskbarProgress(Object.values(jobs));
      const key = `${state}:${value}`;
      if (key === last) return;
      last = key;
      api.app.setTaskbarProgress(state, value).catch(() => undefined);
    };
    apply(useJobs.getState().jobs);
    return useJobs.subscribe((s) => apply(s.jobs));
  }, []);
}

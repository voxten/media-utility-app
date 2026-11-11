import type { JobState } from "../stores/jobs";

/** A job in the shape the jobs store keeps, for stories of job-driven components. */
export function makeJob(fields: Partial<JobState> = {}): JobState {
  return {
    id: "story-job",
    kind: "compressor",
    title: "IMG_2041.png",
    status: "running",
    startedAt: Date.now() / 1000 - 42,
    finishedAt: null,
    error: null,
    percent: 64,
    message: "compressor.status.processing",
    params: { file: "IMG_2041.png", index: 7, total: 12 },
    logs: [],
    partials: [],
    extra: {},
    ...fields,
  };
}

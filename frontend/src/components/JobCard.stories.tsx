import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { makeStyles } from "@fluentui/react-components";
import { makeJob } from "../stories/fixtures";
import { JobCard } from "./JobCard";

const useStyles = makeStyles({ frame: { maxWidth: "420px" } });

/** Width of the jobs popup the card lives in. */
function Frame({ children }: { children: ReactNode }) {
  return <div className={useStyles().frame}>{children}</div>;
}

const meta = {
  title: "Components/JobCard",
  component: JobCard,
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  args: { job: makeJob() },
} satisfies Meta<typeof JobCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};

/** Stand-in for the video thumbnail the backend sends with ctx.describe. */
const THUMB =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 72"><rect width="128" height="72" fill="#3a6b4f"/><circle cx="96" cy="22" r="10" fill="#e8d27a"/><path d="M0 72 40 34l26 24 18-14 44 28z" fill="#24452f"/></svg>',
  );

const VIDEO_META = { thumb: THUMB, height: 1080, ext: "mp4", length: 596, uploader: "Blender Foundation" };

export const Downloading: Story = {
  args: {
    job: makeJob({
      kind: "download",
      title: "Big Buck Bunny 4K",
      percent: 37,
      message: "download.status.downloadingVideo",
      params: { stream: 1, streams: 2 },
      meta: VIDEO_META,
      extra: { downloaded: 18_400_000, total: 49_800_000, speed: 6_400_000, eta: 48 },
    }),
  },
};

export const Downloaded: Story = {
  args: {
    job: makeJob({
      kind: "download",
      title: "Big Buck Bunny 4K",
      status: "done",
      percent: 100,
      finishedAt: Date.now() / 1000,
      message: "download.status.done",
      meta: VIDEO_META,
      result: { path: "C:\\Users\\demo\\Videos\\Big Buck Bunny 4K.mp4", size: 49_800_000, height: 1080, ext: "mp4", length: 596 },
    }),
  },
};

export const BatchWithErrors: Story = {
  args: {
    job: makeJob({
      kind: "download.batch",
      title: "4 URL",
      status: "done",
      percent: 100,
      finishedAt: Date.now() / 1000,
      result: {
        outdir: "C:\\Users\\demo\\Videos",
        succeeded: 3,
        failed: 1,
        totalSize: 182_000_000,
        items: [
          { index: 0, title: "Sintel", status: "done", size: 61_000_000 },
          { index: 1, title: "Tears of Steel", status: "done", size: 74_000_000 },
          { index: 2, title: "Elephants Dream", status: "done", size: 47_000_000 },
          { index: 3, title: "https://example.com/private", status: "error", error: "Private video. Sign in if you've been granted access" },
        ],
      },
    }),
  },
};

export const ConvertedFiles: Story = {
  args: {
    job: makeJob({
      kind: "converter",
      title: "WEBP",
      status: "done",
      percent: 100,
      finishedAt: Date.now() / 1000,
      result: {
        total: 12,
        converted: 12,
        failed: 0,
        inputBytes: 45_000_000,
        outputBytes: 30_200_000,
        outputDir: "C:\\Users\\demo\\Pictures\\webp",
        files: ["C:\\Users\\demo\\Pictures\\webp\\1.webp", "C:\\Users\\demo\\Pictures\\webp\\2.webp"],
      },
    }),
  },
};

export const Done: Story = {
  args: {
    job: makeJob({
      status: "done",
      percent: 100,
      finishedAt: Date.now() / 1000,
      message: "compressor.status.done",
      result: { outPath: "C:\\Users\\demo\\Pictures\\IMG_2041.webp", inBytes: 1_258_291, outBytes: 319_488, savedPercent: 74.6 },
    }),
  },
};

export const Failed: Story = {
  args: {
    job: makeJob({ status: "error", error: "compressor.toast.error", retryable: true, finishedAt: Date.now() / 1000 }),
  },
};

export const FailedWithLongError: Story = {
  args: {
    job: makeJob({
      kind: "download",
      title: "https://x.com/someone/status/1234567890",
      status: "error",
      retryable: true,
      finishedAt: Date.now() / 1000,
      error:
        "ERROR: [twitter] 1234567890: NSFW tweet requires authentication. Use --cookies, --cookies-from-browser, --username and --password, --netrc-cmd, or --netrc (twitter) to provide account credentials. See https://github.com/yt-dlp/yt-dlp/wiki/FAQ for how to pass cookies",
    }),
  },
};

export const FromEarlierSession: Story = {
  args: {
    job: makeJob({
      status: "done",
      percent: 100,
      finishedAt: Date.now() / 1000 - 86_400,
      message: "compressor.status.done",
      result: { outPath: "C:\\Users\\demo\\Pictures\\IMG_2041.webp" },
    }),
    saved: { available: false },
  },
};

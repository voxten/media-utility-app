import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@fluentui/react-components";
import { ArrowMinimize16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { makeJob } from "../stories/fixtures";
import type { JobState } from "../stores/jobs";
import { ActionBar } from "./ActionBar";

function Bar({ job }: { job?: JobState }) {
  const { t } = useTranslation();
  return (
    <ActionBar job={job} idleText={t("tts.idle.empty")} onCancel={() => undefined}>
      <Button appearance="primary" icon={<ArrowMinimize16Regular />} disabled={job?.status === "running"}>
        {t("compressor.compressAction")}
      </Button>
    </ActionBar>
  );
}

const meta = {
  title: "Components/ActionBar",
  component: Bar,
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Running: Story = { args: { job: makeJob() } };

export const Indeterminate: Story = { args: { job: makeJob({ percent: null, message: "download.status.probing" }) } };

export const Done: Story = {
  args: { job: makeJob({ status: "done", percent: 100, message: "compressor.status.done", finishedAt: Date.now() / 1000 }) },
};

export const Failed: Story = {
  args: { job: makeJob({ status: "error", error: "compressor.toast.error", finishedAt: Date.now() / 1000 }) },
};

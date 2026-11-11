import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Field } from "@fluentui/react-components";
import { ArrowMinimize16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { formatList, IMAGE_EXTENSIONS } from "../lib/fileTypes";
import { makeJob } from "../stories/fixtures";
import type { JobState } from "../stores/jobs";
import { ActionBar } from "./ActionBar";
import { Columns } from "./Columns";
import { DropZone } from "./DropZone";
import { ToolPage } from "./Page";
import { Panel } from "./Panel";
import { PathPicker } from "./PathPicker";
import { Select } from "./Select";
import { SliderField } from "./SliderField";

type Mode = "smart" | "lossless" | "target";

/** A typical tool page: workspace on the left, options on the right, ActionBar docked at the bottom. */
function ToolLayout({ job }: { job?: JobState }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("smart");
  const [quality, setQuality] = useState(80);
  const [folder, setFolder] = useState("C:\\Users\\demo\\Pictures\\compressed");
  const modeLabels: Record<Mode, string> = {
    smart: t("compressor.modeSmart"),
    lossless: t("compressor.modeLossless"),
    target: t("compressor.modeTarget"),
  };

  const options = (
    <Panel title={t("common.outputFormat")}>
      <Field label={t("compressor.mode")}>
        <Select
          value={mode}
          onChange={setMode}
          options={(Object.keys(modeLabels) as Mode[]).map((value) => ({ value, label: modeLabels[value] }))}
        />
      </Field>
      <SliderField label={t("compressor.quality")} value={quality} min={1} max={100} onChange={setQuality} format={(v) => `${v}%`} />
      <Field label={t("common.outputFolder")}>
        <PathPicker value={folder} onChange={setFolder} />
      </Field>
    </Panel>
  );

  return (
    <ToolPage toolId="compressor">
      <Columns side={options}>
        <DropZone
          title={t("compressor.dropTitle")}
          hint={t("compressor.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
          accept={IMAGE_EXTENSIONS}
          onFiles={() => undefined}
          onBrowse={() => undefined}
        />
      </Columns>
      <ActionBar job={job} idleText={t("tts.idle.empty")} onCancel={() => undefined}>
        <Button appearance="primary" icon={<ArrowMinimize16Regular />} disabled={job?.status === "running"}>
          {t("compressor.compressAction")}
        </Button>
      </ActionBar>
    </ToolPage>
  );
}

/** A tool page before any file is added: the drop zone takes the whole page. */
function EmptyToolPage() {
  const { t } = useTranslation();
  return (
    <ToolPage toolId="compressor">
      <DropZone
        fill
        title={t("compressor.dropTitle")}
        hint={t("compressor.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
        accept={IMAGE_EXTENSIONS}
        onFiles={() => undefined}
        onBrowse={() => undefined}
      />
    </ToolPage>
  );
}

const meta = {
  title: "Layout/ToolPage",
  component: ToolLayout,
  parameters: { surface: "page" },
} satisfies Meta<typeof ToolLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Running: Story = { args: { job: makeJob() } };

export const Empty: Story = { render: () => <EmptyToolPage /> };

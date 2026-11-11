import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { formatList, IMAGE_EXTENSIONS } from "../lib/fileTypes";
import { DropZone } from "./DropZone";

function Zone({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <DropZone
      compact={compact}
      title={t("compressor.dropTitle")}
      hint={t("compressor.dropHint", { formats: formatList(IMAGE_EXTENSIONS) })}
      accept={IMAGE_EXTENSIONS}
      onFiles={() => undefined}
      onBrowse={() => undefined}
    />
  );
}

const meta = {
  title: "Components/DropZone",
  component: Zone,
} satisfies Meta<typeof Zone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = { args: { compact: true } };

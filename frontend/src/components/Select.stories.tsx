import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { formatOptions } from "../lib/fileTypes";
import { Select } from "./Select";

const FORMATS = ["png", "jpeg", "webp", "avif", "bmp", "tiff", "gif", "ico"] as const;

function Demo({ searchable, disabled }: { searchable?: boolean; disabled?: boolean }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<(typeof FORMATS)[number]>("webp");
  return (
    <Field label={t("common.outputFormat")}>
      <Select searchable={searchable} disabled={disabled} options={formatOptions(FORMATS)} value={value} onChange={setValue} />
    </Field>
  );
}

const meta = {
  title: "Components/Select",
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const Searchable: Story = { args: { searchable: true } };

export const Disabled: Story = { args: { disabled: true } };

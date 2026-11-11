import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { SliderField } from "./SliderField";

type Props = ComponentProps<typeof SliderField> & { labelKey: string };

function Controlled({ labelKey, ...props }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(props.value);
  return <SliderField {...props} label={t(labelKey)} value={value} onChange={setValue} format={(v) => `${v}%`} />;
}

const meta = {
  title: "Components/SliderField",
  component: Controlled,
  args: { labelKey: "compressor.quality", label: "", value: 80, min: 1, max: 100, onChange: () => undefined },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Quality: Story = {};

export const ShortRangeWithSteps: Story = { args: { labelKey: "tts.rate", min: -50, max: 50, step: 10, value: 0 } };

export const Disabled: Story = { args: { disabled: true } };

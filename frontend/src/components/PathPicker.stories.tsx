import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PathPicker } from "./PathPicker";

function Controlled(props: ComponentProps<typeof PathPicker>) {
  const [value, setValue] = useState(props.value);
  return <PathPicker {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Components/PathPicker",
  component: PathPicker,
  render: (args) => <Controlled {...args} />,
  args: { value: "C:\\Users\\demo\\Downloads", onChange: () => undefined, mode: "folder" },
} satisfies Meta<typeof PathPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folder: Story = {};

export const Openable: Story = { args: { openable: true, clearable: true } };

export const Empty: Story = { args: { value: "" } };

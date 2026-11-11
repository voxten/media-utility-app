import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResultCard } from "./ResultCard";

const meta = {
  title: "Components/ResultCard",
  component: ResultCard,
  args: {
    title: "",
    path: "C:\\Users\\demo\\Pictures\\compressed\\IMG_2041.webp",
    sourceToolId: "compressor",
    detail: "1.4 MB → 312 KB",
  },
  render: function Render(args) {
    return <ResultCard {...args} />;
  },
} satisfies Meta<typeof ResultCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const File: Story = { args: { title: "IMG_2041.webp" } };

export const Folder: Story = { args: { title: "C:\\Users\\demo\\Pictures\\compressed", folder: true, detail: undefined, path: "C:\\Users\\demo\\Pictures\\compressed" } };

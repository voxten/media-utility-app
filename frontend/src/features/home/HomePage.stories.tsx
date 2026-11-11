import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRecentTools } from "../../stores/recentTools";
import HomePage from "./HomePage";

const meta = {
  title: "Pages/Home",
  component: HomePage,
  parameters: { surface: "page" },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecentTools: Story = {
  render: function Render() {
    useRecentTools.setState({ ids: ["download", "compressor", "tts", "pdf"] });
    return <HomePage />;
  },
};

export const FirstRun: Story = {
  render: function Render() {
    useRecentTools.setState({ ids: [] });
    return <HomePage />;
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Video48Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";

const meta = {
  title: "Components/EmptyState",
  component: EmptyState,
  args: { title: "" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InPanel: Story = {
  render: function Render() {
    const { t } = useTranslation();
    return (
      <Panel>
        <EmptyState icon={Video48Regular} title={t("download.emptyTitle")}>
          {t("download.emptyBody")}
        </EmptyState>
      </Panel>
    );
  },
};

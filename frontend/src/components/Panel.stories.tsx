import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Input } from "@fluentui/react-components";
import { Add16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Panel } from "./Panel";

const meta = {
  title: "Components/Panel",
  component: Panel,
  args: { children: null },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {
  render: function Render() {
    const { t } = useTranslation();
    return (
      <Panel title={t("tts.text")}>
        <Input placeholder={t("download.urlPlaceholder")} />
      </Panel>
    );
  },
};

export const WithActions: Story = {
  render: function Render() {
    const { t } = useTranslation();
    return (
      <Panel
        title={t("download.queueTitle")}
        actions={
          <>
            <Button appearance="subtle">{t("common.clearAll")}</Button>
            <Button icon={<Add16Regular />}>{t("common.add")}</Button>
          </>
        }
      >
        <Input placeholder={t("download.urlPlaceholder")} />
      </Panel>
    );
  },
};

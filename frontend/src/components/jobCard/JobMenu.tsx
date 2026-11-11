import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tooltip } from "@fluentui/react-components";
import { ArrowRight16Regular, Copy16Regular, MoreHorizontal16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { ToolDefinition } from "../../app/tools";
import { navigate } from "../../lib/router";
import { useTransferStore } from "../../stores/transfer";
import { useNotify } from "../notify";

interface JobMenuProps {
  tool: ToolDefinition | undefined;
  resultFiles: string[];
  copyPath: string | null;
  errorText: string;
  onNavigate?: () => void;
}

/** The card's "⋯" menu: "Send to", "Copy path", "Copy error" and "Open tool", each only when it applies. */
export function JobMenu({ tool, resultFiles, copyPath, errorText, onNavigate }: JobMenuProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const Icon = tool?.icon;

  const copy = (text: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify.success(t("jobs.copied")))
      .catch(() => undefined);

  const menuItems = [
    resultFiles.length > 0 && (
      <MenuItem
        key="send"
        icon={<ArrowRight16Regular />}
        onClick={() => {
          useTransferStore.getState().openModal(resultFiles, tool?.id);
          onNavigate?.();
        }}
      >
        {t("transfer.sendTo")}
      </MenuItem>
    ),
    copyPath && (
      <MenuItem key="path" icon={<Copy16Regular />} onClick={() => copy(copyPath)}>
        {t("jobs.copyPath")}
      </MenuItem>
    ),
    errorText && (
      <MenuItem key="error" icon={<Copy16Regular />} onClick={() => copy(errorText)}>
        {t("jobs.copyError")}
      </MenuItem>
    ),
    tool && (
      <MenuItem
        key="tool"
        icon={Icon && <Icon />}
        onClick={() => {
          navigate(tool.id);
          onNavigate?.();
        }}
      >
        {t("jobs.openTool")}
      </MenuItem>
    ),
  ].filter(Boolean);

  if (menuItems.length === 0) return null;
  return (
    <Menu positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        <Tooltip content={t("common.more")} relationship="label">
          <Button size="small" appearance="subtle" icon={<MoreHorizontal16Regular />} />
        </Tooltip>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>{menuItems}</MenuList>
      </MenuPopover>
    </Menu>
  );
}

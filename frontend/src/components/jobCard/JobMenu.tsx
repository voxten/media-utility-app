import { Button, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, Tooltip } from "@fluentui/react-components";
import {
  ArrowRepeatAll16Regular,
  ArrowRight16Regular,
  Copy16Regular,
  Delete16Regular,
  Edit16Regular,
  Link16Regular,
  MoreHorizontal16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { openWithSettings, replayTool } from "../../app/replay";
import type { ToolDefinition } from "../../app/tools";
import { api } from "../../lib/bridge";
import { errorMessage } from "../../lib/errors";
import { navigate } from "../../lib/router";
import type { HistoryEntry } from "../../lib/types";
import { useJobs } from "../../stores/jobs";
import { useTransferStore } from "../../stores/transfer";
import { useNotify } from "../notify";

interface JobMenuProps {
  tool: ToolDefinition | undefined;
  resultFiles: string[];
  copyPath: string | null;
  errorText: string;
  /** Links the job downloaded from. */
  links: string[];
  /** Set on a card in the history: its saved entry, which may run again. */
  entry?: Pick<HistoryEntry, "id" | "replay">;
  /** The card already offers "Retry", which runs the job again too. */
  retryShown: boolean;
  onNavigate?: () => void;
}

/**
 * The card's "⋯" menu: "Send to", "Copy path", "Copy link(s)", "Copy error", "Open tool" and, in the history,
 * "Open with these settings", "Run again" and "Remove from history", each only when it applies.
 */
export function JobMenu({ tool, resultFiles, copyPath, errorText, links, entry, retryShown, onNavigate }: JobMenuProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const Icon = tool?.icon;
  const replay = entry?.replay;

  const copy = (text: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify.success(t("jobs.copied")))
      .catch(() => undefined);

  const rerun = (id: string) =>
    api.jobs
      .rerun(id)
      .then(() => notify.success(t("jobs.rerunStarted")))
      .catch((err) => notify.error(t("jobs.rerunFailed"), { body: errorMessage(t, err) }));

  const openSettings = () => {
    if (!replay) return;
    openWithSettings(replay)
      .then(() => onNavigate?.())
      .catch((err) => notify.error(t("jobs.rerunFailed"), { body: errorMessage(t, err) }));
  };

  const remove = (id: string) =>
    useJobs
      .getState()
      .removeHistory(id)
      .catch((err) => notify.error(errorMessage(t, err)));

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
    links.length > 0 && (
      <MenuItem key="links" icon={<Link16Regular />} onClick={() => copy(links.join("\n"))}>
        {links.length === 1 ? t("jobs.copyLink") : t("jobs.copyLinks")}
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
    replayTool(replay) && (
      <MenuItem key="settings" icon={<Edit16Regular />} onClick={openSettings}>
        {t("jobs.openWithSettings")}
      </MenuItem>
    ),
    entry && replay && !retryShown && (
      <MenuItem key="rerun" icon={<ArrowRepeatAll16Regular />} onClick={() => rerun(entry.id)}>
        {t("jobs.rerun")}
      </MenuItem>
    ),
  ].filter(Boolean);

  if (menuItems.length === 0 && !entry) return null;
  return (
    <Menu positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        <Tooltip content={t("common.more")} relationship="label">
          <Button size="small" appearance="subtle" icon={<MoreHorizontal16Regular />} />
        </Tooltip>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {menuItems}
          {entry && (
            <>
              {menuItems.length > 0 && <MenuDivider />}
              <MenuItem icon={<Delete16Regular />} onClick={() => remove(entry.id)}>
                {t("jobs.removeFromHistory")}
              </MenuItem>
            </>
          )}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

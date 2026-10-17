import { useEffect, useRef, useState } from "react";
import { Badge, Button, Caption1, makeStyles, mergeClasses, tokens, Tooltip } from "@fluentui/react-components";
import { ChevronDown16Regular, ChevronRight16Regular, Copy16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { LogEntry } from "../lib/types";
import { translateMessage } from "../lib/jobMessage";

const MAX_VISIBLE = 500;

const useStyles = makeStyles({
  root: {
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: "hidden",
  },
  header: { display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px 4px 4px" },
  toggle: { flexGrow: 1, justifyContent: "flex-start" },
  list: {
    maxHeight: "220px",
    overflowY: "auto",
    padding: "6px 14px 10px",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    userSelect: "text",
  },
  line: { whiteSpace: "pre-wrap", wordBreak: "break-word", color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground1 },
  warning: { color: tokens.colorPaletteMarigoldForeground1 },
  time: { color: tokens.colorNeutralForeground4, marginRight: "8px" },
});

interface LogPanelProps {
  logs: LogEntry[];
  title?: string;
  defaultOpen?: boolean;
}

export function LogPanel({ logs, title, defaultOpen = false }: LogPanelProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const errors = logs.filter((l) => l.level === "error").length;
  const [open, setOpen] = useState(defaultOpen);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, open]);

  // Errors deserve attention: open the panel automatically when the first one arrives.
  useEffect(() => {
    if (errors > 0) setOpen(true);
  }, [errors > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = logs.slice(-MAX_VISIBLE).map((log) => ({
    ...log,
    text: translateMessage(t, log.message, log.params),
    clock: new Date(log.time * 1000).toLocaleTimeString(),
  }));

  const copy = () => navigator.clipboard?.writeText(lines.map((l) => `[${l.clock}] ${l.text}`).join("\n"));

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Button
          appearance="transparent"
          className={styles.toggle}
          icon={open ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
          onClick={() => setOpen((o) => !o)}
        >
          {title ?? t("common.log")}
        </Button>
        <Badge appearance="tint" color="informative">
          {logs.length}
        </Badge>
        {errors > 0 && (
          <Badge appearance="tint" color="danger">
            {t("common.errorsCount", { count: errors })}
          </Badge>
        )}
        <Tooltip content={t("common.copy")} relationship="label">
          <Button appearance="subtle" size="small" icon={<Copy16Regular />} onClick={copy} disabled={!logs.length} />
        </Tooltip>
      </div>
      {open && (
        <div className={styles.list} ref={listRef}>
          {lines.length === 0 && <Caption1>{t("common.logEmpty")}</Caption1>}
          {lines.map((line, i) => (
            <div key={i} className={mergeClasses(styles.line, line.level === "error" && styles.error, line.level === "warning" && styles.warning)}>
              <span className={styles.time}>{line.clock}</span>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { ErrorCircle24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { reportError } from "../lib/errors";
import { EmptyState } from "./EmptyState";

const useStyles = makeStyles({
  root: { height: "100%", display: "grid", placeItems: "center", padding: tokens.spacingHorizontalXXL },
  detail: {
    display: "block",
    maxWidth: "560px",
    marginBottom: tokens.spacingVerticalL,
    color: tokens.colorNeutralForeground3,
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, justifyContent: "center" },
});

export interface ErrorFallbackAction {
  label: string;
  onClick: () => void;
}

/** A failure the window cannot continue past: what happened and the ways out. */
export function ErrorScreen({ message, actions }: { message: string; actions: ErrorFallbackAction[] }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <div className={styles.root} role="alert">
      <EmptyState icon={ErrorCircle24Regular} title={t("errors.crashTitle")}>
        <Caption1 className={styles.detail}>{message || t("errors.unknown")}</Caption1>
        <span className={styles.actions}>
          {actions.map((action, index) => (
            <Button key={action.label} appearance={index === 0 ? "primary" : "secondary"} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </span>
      </EmptyState>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Buttons under the message; `reset` renders the children again. */
  actions: (reset: () => void) => ErrorFallbackAction[];
}

/** Catches a render error below it and shows what happened instead of an empty window. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError("render", error, info.componentStack ?? "");
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen message={error.message} actions={this.props.actions(this.reset)} />;
  }
}

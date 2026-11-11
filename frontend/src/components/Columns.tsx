// Tool page layout: the workspace (files, preview, text) on the left, a fixed-width options column on the right.
// Below 1050px window width the options move under the workspace.

import type { ReactNode } from "react";
import { makeStyles } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 360px",
    gap: "20px",
    alignItems: "start",
    "@media (max-width: 1050px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  column: { display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 },
});

interface ColumnsProps {
  /** Options for the work on the left, usually one or two Panels. */
  side: ReactNode;
  children: ReactNode;
}

export function Columns({ side, children }: ColumnsProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <div className={styles.column}>{children}</div>
      <aside className={styles.column}>{side}</aside>
    </div>
  );
}

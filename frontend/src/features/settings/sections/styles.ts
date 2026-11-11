import { makeStyles, tokens } from "@fluentui/react-components";

export const useSettingsStyles = makeStyles({
  dropdown: { minWidth: "180px", maxWidth: "100%" },
  cookieRows: { display: "flex", flexDirection: "column", gap: "8px", width: "100%", minWidth: 0 },
  cookieRow: {
    display: "grid",
    gridTemplateColumns: "110px minmax(0, 1fr)",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
    "@media (max-width: 600px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: "4px",
    },
  },
  hint: { color: tokens.colorNeutralForeground3 },
  depDetail: { color: tokens.colorNeutralForeground3, wordBreak: "break-all" },
  depActions: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" },
  depProgress: { display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px", maxWidth: "320px" },
  depProgressHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  progressStatus: { color: tokens.colorNeutralForeground2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
});

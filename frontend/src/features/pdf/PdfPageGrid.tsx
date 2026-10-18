// Read-only grid of a PDF's pages; with `onToggle` pages can be picked by clicking them.

import { Button, Caption1, makeStyles, mergeClasses, Spinner, tokens, Tooltip } from "@fluentui/react-components";
import { CheckmarkCircle20Filled, Eye16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ON_IMAGE } from "../../lib/onImage";
import type { PdfPageInfo } from "./usePdfPages";

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "12px",
    maxHeight: "520px",
    overflowY: "auto",
    padding: "2px",
  },
  tile: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "8px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "pointer",
    textAlign: "left",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: tokens.durationFast,
    ":hover": { boxShadow: tokens.shadow8 },
    ":hover .page-preview": { opacity: 1 },
    ":focus-visible .page-preview": { opacity: 1 },
  },
  selected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    padding: "7px",
  },
  dimmed: { opacity: 0.55 },
  thumbBox: {
    aspectRatio: "1 / 1.35",
    display: "grid",
    placeItems: "center",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
  },
  thumb: { maxWidth: "100%", maxHeight: "100%", boxShadow: tokens.shadow4, backgroundColor: ON_IMAGE.paper },
  check: {
    position: "absolute",
    top: "12px",
    left: "12px",
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "50%",
  },
  colorBar: { position: "absolute", left: "8px", right: "8px", top: "0", height: "3px", borderRadius: "0 0 3px 3px" },
  label: {
    position: "absolute",
    top: "12px",
    left: "12px",
    minWidth: "20px",
    height: "20px",
    padding: "0 6px",
    borderRadius: "10px",
    display: "grid",
    placeItems: "center",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: ON_IMAGE.light,
    backgroundColor: ON_IMAGE.scrim,
  },
  preview: {
    position: "absolute",
    top: "12px",
    right: "12px",
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: tokens.durationFast,
  },
  previewButton: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  number: { color: tokens.colorNeutralForeground3, textAlign: "center" },
  loading: { display: "flex", alignItems: "center", gap: "8px", gridColumn: "1 / -1", color: tokens.colorNeutralForeground3 },
});

/** Page that belongs to a coloured group, e.g. one output file of the splitter. */
export interface PageMark {
  color: string;
  label: string;
}

interface PdfPageGridProps {
  pages: PdfPageInfo[];
  loading?: boolean;
  /** 0-based indexes of picked pages; only used together with `onToggle`. */
  selected?: Set<number>;
  /** Coloured groups by 0-based page index; used instead of `selected` together with `onToggle`. */
  marks?: Map<number, PageMark>;
  /** `extend` is true for Shift+click, to act on the run of pages since the last click. */
  onToggle?: (page: number, extend: boolean) => void;
  onPreview: (page: PdfPageInfo) => void;
}

export function PdfPageGrid({ pages, loading, selected, marks, onToggle, onPreview }: PdfPageGridProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const picking = !!onToggle && ((marks?.size ?? 0) > 0 || (selected?.size ?? 0) > 0);

  return (
    <div className={styles.grid}>
      {pages.map((p) => {
        const mark = onToggle ? marks?.get(p.page) : undefined;
        const isSelected = !!onToggle && (!!mark || !!selected?.has(p.page));
        return (
          <div
            key={p.page}
            role={onToggle ? "checkbox" : "button"}
            aria-checked={onToggle ? isSelected : undefined}
            aria-label={t("pdf.pageShort", { page: p.page + 1 })}
            tabIndex={0}
            className={mergeClasses(
              styles.tile,
              isSelected && styles.selected,
              picking && !isSelected && styles.dimmed,
            )}
            style={mark ? { borderColor: mark.color } : undefined}
            onClick={(e) => (onToggle ? onToggle(p.page, e.shiftKey) : onPreview(p))}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (onToggle) onToggle(p.page, e.shiftKey);
              else onPreview(p);
            }}
          >
            {mark && <span className={styles.colorBar} style={{ backgroundColor: mark.color }} />}
            <div className={styles.thumbBox}>
              <img className={styles.thumb} src={p.thumb} alt="" draggable={false} />
            </div>
            {mark ? (
              <span className={styles.label}>{mark.label}</span>
            ) : (
              isSelected && <CheckmarkCircle20Filled className={styles.check} />
            )}
            {onToggle && (
              <div className={`${styles.preview} page-preview`}>
                <Tooltip content={t("pdf.preview")} relationship="label">
                  <Button
                    size="small"
                    className={styles.previewButton}
                    icon={<Eye16Regular />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview(p);
                    }}
                  />
                </Tooltip>
              </div>
            )}
            <Caption1 className={styles.number}>{p.page + 1}</Caption1>
          </div>
        );
      })}
      {loading && (
        <div className={styles.loading}>
          <Spinner size="tiny" />
          <Caption1>{t("pdf.loading")}</Caption1>
        </div>
      )}
    </div>
  );
}

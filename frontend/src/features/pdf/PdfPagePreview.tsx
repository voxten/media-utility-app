// Large preview of one PDF page: opens at once with the thumbnail, then swaps in a sharp render.

import { useState } from "react";
import { Dialog, DialogBody, DialogSurface, DialogTitle, makeStyles, Text, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/bridge";
import { ON_IMAGE } from "../../lib/onImage";
import type { PdfPageInfo } from "./usePdfPages";

const useStyles = makeStyles({
  surface: { width: "min(80vw, 900px)", maxWidth: "min(80vw, 900px)" },
  body: { gridColumn: "1 / -1" },
  img: {
    width: "100%",
    maxHeight: "75vh",
    objectFit: "contain",
    backgroundColor: ON_IMAGE.paper,
    borderRadius: tokens.borderRadiusMedium,
  },
});

export function usePdfPagePreview() {
  const styles = useStyles();
  const { t } = useTranslation();
  // The last page is kept after closing so the dialog does not empty out during its exit animation.
  const [preview, setPreview] = useState<{ page: PdfPageInfo; src: string } | null>(null);
  const [open, setOpen] = useState(false);

  const show = (page: PdfPageInfo) => {
    setPreview({ page, src: page.thumb });
    setOpen(true);
    api.pdf
      .renderPage(page.file, page.page)
      .then((src) => setPreview((p) => (p && p.page.file === page.file && p.page.page === page.page ? { ...p, src } : p)))
      .catch(() => undefined);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            {preview && (
              <Text weight="semibold">
                {preview.page.fileName} · {t("pdf.pageShort", { page: preview.page.page + 1 })}
              </Text>
            )}
          </DialogTitle>
          <div className={styles.body}>
            {preview && <img className={styles.img} src={preview.src} alt="" />}
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );

  return { show, dialog };
}

import { describe, expect, it } from "vitest";
import { pdfName } from "./PdfOutputFields";

describe("pdfName", () => {
  it("uses the typed name with a .pdf extension", () => {
    expect(pdfName(" Report ", "merged.pdf")).toBe("Report.pdf");
    expect(pdfName("scan.png", "merged.pdf")).toBe("scan.pdf");
    expect(pdfName("final.PDF", "merged.pdf")).toBe("final.pdf");
  });

  it("falls back to the default name", () => {
    expect(pdfName("  ", "merged.pdf")).toBe("merged.pdf");
  });
});

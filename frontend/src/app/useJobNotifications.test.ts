import { describe, expect, it } from "vitest";
import { jobToastTool } from "./useJobNotifications";

describe("jobToastTool", () => {
  it("names the tool while the user is on another page", () => {
    expect(jobToastTool("instagram", "home")?.id).toBe("instagram");
    expect(jobToastTool("pdf.split", "converter")?.id).toBe("pdf_split");
  });

  it("stays quiet on the tool's own page, which shows its result card", () => {
    expect(jobToastTool("instagram", "instagram")).toBeNull();
    expect(jobToastTool("pdf.split", "pdf_split")).toBeNull();
  });

  it("never toasts for quick background checks", () => {
    expect(jobToastTool("download.probe", "home")).toBeNull();
    expect(jobToastTool(undefined, "home")).toBeNull();
  });
});

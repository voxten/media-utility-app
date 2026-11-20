import { describe, expect, it } from "vitest";
import { defaultLanguage, languageOptions, pickSources } from "./sources";

const LANGUAGES = [
  { tag: "pl", name: "Polski" },
  { tag: "en-US", name: "English (United States)" },
];

describe("pickSources", () => {
  it("keeps every image and skips other files", () => {
    expect(pickSources(["C:\\a.PNG", "C:\\b.jpg", "C:\\c.mp4"])).toEqual({ sources: ["C:\\a.PNG", "C:\\b.jpg"], skipped: 1 });
  });

  it("takes the first PDF alone", () => {
    expect(pickSources(["C:\\a.png", "C:\\scan.pdf", "C:\\other.pdf"])).toEqual({ sources: ["C:\\scan.pdf"], skipped: 2 });
  });
});

describe("languages", () => {
  it("names languages in the UI language", () => {
    const options = languageOptions([{ tag: "pl", name: "Polski" }, { tag: "de", name: "Deutsch" }], "pl");
    expect(options.map((o) => o.label)).toEqual(["Niemiecki", "Polski"]);
  });

  it("prefers the saved language, then the UI language", () => {
    expect(defaultLanguage(LANGUAGES, "en-US", "pl")).toBe("en-US");
    expect(defaultLanguage(LANGUAGES, "de", "en")).toBe("en-US");
    expect(defaultLanguage(LANGUAGES, undefined, "de")).toBe("pl");
    expect(defaultLanguage([], undefined, "pl")).toBe("");
  });
});

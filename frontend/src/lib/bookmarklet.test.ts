import type { DragEvent } from "react";
import { describe, expect, it } from "vitest";
import { BOOKMARKLET, startBookmarkDrag } from "./bookmarklet";

describe("bookmarklet", () => {
  it("wraps the code in void so the page stays as it is", () => {
    expect(BOOKMARKLET).toMatch(/^javascript:void\(.*\)$/);
    expect(BOOKMARKLET).toContain("mediastudio://open?url='+encodeURIComponent(location.href)");
  });

  it("puts the bookmark into every drag format browsers read", () => {
    const data = new Map<string, string>();
    const event = {
      dataTransfer: { effectAllowed: "", setData: (type: string, value: string) => data.set(type, value) },
    } as unknown as DragEvent<HTMLElement>;
    startBookmarkDrag(event, "Pobierz <w> Media Studio");
    expect(data.get("text/uri-list")).toBe(BOOKMARKLET);
    expect(data.get("text/plain")).toBe(BOOKMARKLET);
    expect(data.get("text/x-moz-url")).toBe(`${BOOKMARKLET}\nPobierz <w> Media Studio`);
    expect(data.get("text/html")).toBe(`<a href="${BOOKMARKLET}">Pobierz &lt;w&gt; Media Studio</a>`);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import type { Active, Over } from "@dnd-kit/core";
import i18n from "../i18n";
import { sortableAccessibility } from "./sortableAccessibility";

const item = (id: string) => ({ id }) as Active & Over;

describe("sortableAccessibility", () => {
  beforeAll(() => i18n.changeLanguage("pl"));

  it("announces moves in the app language with names and positions", () => {
    const { announcements, screenReaderInstructions } = sortableAccessibility(i18n.t, ["a", "b", "c"], (id) => `plik-${String(id)}`);
    expect(screenReaderInstructions?.draggable).toBe(i18n.t("common.sortable.instructions"));
    expect(announcements?.onDragStart({ active: item("a") })).toBe(i18n.t("common.sortable.pickedUp", { name: "plik-a", position: 1, total: 3 }));
    expect(announcements?.onDragOver({ active: item("a"), over: item("c") })).toContain("plik-a");
    expect(announcements?.onDragEnd({ active: item("a"), over: item("c") })).toBe(i18n.t("common.sortable.dropped", { name: "plik-a", position: 3, total: 3 }));
    expect(announcements?.onDragEnd({ active: item("b"), over: null })).toBe(i18n.t("common.sortable.cancelled", { name: "plik-b" }));
    expect(announcements?.onDragStart({ active: item("a") })).not.toMatch(/Draggable|Picked up/);
  });
});

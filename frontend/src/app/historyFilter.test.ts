import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../lib/types";
import { ALL, EMPTY_FILTER, filterHistory, groupByDay, historyFacets } from "./historyFilter";

const entry = (id: string, fields: Partial<HistoryEntry>): HistoryEntry => ({
  id,
  kind: "converter",
  title: "",
  status: "done",
  startedAt: 0,
  finishedAt: 0,
  error: null,
  outputs: [],
  available: true,
  ...fields,
});

const entries = [
  entry("webp", { kind: "converter", title: "WEBP", outputs: ["C:\\Pictures\\Wakacje.webp"] }),
  entry("clip", { kind: "download", title: "Żółty rower", outputs: ["D:/Downloads/rower.mp4"] }),
  entry("pdf", { kind: "pdf.split", title: "raport.pdf", status: "error" }),
];
const title = (e: HistoryEntry) => e.title;
const ids = (list: HistoryEntry[]) => list.map((e) => e.id);

describe("filterHistory", () => {
  it("keeps everything without a filter", () => {
    expect(ids(filterHistory(entries, EMPTY_FILTER, title))).toEqual(["webp", "clip", "pdf"]);
  });

  it("finds the title or an output file name, ignoring case and accents", () => {
    expect(ids(filterHistory(entries, { ...EMPTY_FILTER, query: "zolty" }, title))).toEqual(["clip"]);
    expect(ids(filterHistory(entries, { ...EMPTY_FILTER, query: " wakacje " }, title))).toEqual(["webp"]);
    expect(ids(filterHistory(entries, { ...EMPTY_FILTER, query: "downloads" }, title))).toEqual([]);
  });

  it("filters by tool and status", () => {
    expect(ids(filterHistory(entries, { ...EMPTY_FILTER, tool: "pdf_split" }, title))).toEqual(["pdf"]);
    expect(ids(filterHistory(entries, { query: "", tool: ALL, status: "done" }, title))).toEqual(["webp", "clip"]);
    expect(ids(filterHistory(entries, { query: "raport", tool: "download", status: ALL }, title))).toEqual([]);
  });
});

describe("historyFacets", () => {
  it("lists the tools and statuses present once", () => {
    expect(historyFacets([...entries, entry("again", { kind: "converter" })])).toEqual({
      tools: ["converter", "download", "pdf_split"],
      statuses: ["done", "error"],
    });
  });
});

describe("groupByDay", () => {
  const now = new Date(2026, 10, 11, 15, 0);
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime() / 1000;

  it("splits newest-first entries into today, yesterday and older dates", () => {
    const list = [
      entry("a", { finishedAt: at(11, 14) }),
      entry("b", { finishedAt: at(11, 0) }),
      entry("c", { finishedAt: at(10, 23) }),
      entry("d", { finishedAt: at(3, 9) }),
      entry("e", { finishedAt: at(3, 8) }),
    ];
    const groups = groupByDay(list, now);
    expect(groups.map((g) => [g.day, ids(g.entries)])).toEqual([
      ["today", ["a", "b"]],
      ["yesterday", ["c"]],
      ["2026-11-03", ["d", "e"]],
    ]);
    expect(groups[2].date).toEqual(new Date(2026, 10, 3));
  });

  it("uses the start time when a job never finished", () => {
    const groups = groupByDay([entry("x", { finishedAt: null, startedAt: at(10, 12) })], now);
    expect(groups[0].day).toBe("yesterday");
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

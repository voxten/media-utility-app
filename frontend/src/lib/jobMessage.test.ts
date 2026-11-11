import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { jobMessage, translateMessage } from "./jobMessage";

beforeAll(() => i18n.changeLanguage("en"));

const base = { status: "running" as const, message: null, params: {}, error: null };

describe("jobMessage", () => {
  it("translates i18n keys and keeps library text as is", () => {
    expect(translateMessage(i18n.t, "common.cancel")).toBe(i18n.t("common.cancel"));
    expect(translateMessage(i18n.t, "Some yt-dlp message")).toBe("Some yt-dlp message");
    expect(translateMessage(i18n.t, null)).toBe("");
  });

  it("keeps URLs and file names used as job titles intact", () => {
    expect(translateMessage(i18n.t, "https://www.instagram.com/p/abc/")).toBe("https://www.instagram.com/p/abc/");
    expect(translateMessage(i18n.t, "clip.final.mp4")).toBe("clip.final.mp4");
    expect(translateMessage(i18n.t, "WEBP")).toBe("WEBP");
  });

  it("cleans ANSI colours and the ERROR prefix from errors", () => {
    const error = "\u001b[0;31mERROR:\u001b[0m Video unavailable";
    expect(jobMessage(i18n.t, { ...base, status: "error", error })).toBe("Video unavailable");
    expect(jobMessage(i18n.t, { ...base, status: "error", error: "[0;31mERROR:[0m Video unavailable" })).toBe("Video unavailable");
  });

  it("keeps the site tag yt-dlp puts in front of errors", () => {
    const error = "ERROR: [twitter] 123: NSFW tweet requires authentication";
    expect(jobMessage(i18n.t, { ...base, status: "error", error })).toBe("[twitter] 123: NSFW tweet requires authentication");
  });

  it("falls back to a generic error text", () => {
    expect(jobMessage(i18n.t, { ...base, status: "error" })).toBe(i18n.t("common.jobStatus.error"));
  });

  it("passes the rounded percent to the message", () => {
    i18n.addResource("en", "translation", "test.progress", "{{percent}}% of {{name}}");
    expect(jobMessage(i18n.t, { ...base, message: "test.progress", params: { name: "a.png" }, percent: 41.6 })).toBe("42% of a.png");
  });
});

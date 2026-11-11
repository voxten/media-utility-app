import { beforeEach, describe, expect, it } from "vitest";
import { useDownloadForm } from "../features/download/store";
import { useInstagramForm } from "../features/instagram/store";
import { useSettings } from "../stores/settings";
import { appendToQueue, isNewLink, linkFromText, openClipboardLink } from "./clipboardLink";
import type { Settings } from "./types";

const youtube = { url: "https://youtu.be/abc", target: "download" as const };
const instagram = { url: "https://www.instagram.com/p/xyz/", target: "instagram" as const };
const several = { url: "https://youtu.be/a", target: "download" as const, urls: ["https://youtu.be/a", "https://x.com/u/status/1"] };

beforeEach(() => {
  window.location.hash = "";
  useDownloadForm.setState({ url: "", tab: "batch", batchText: "", autoProbe: false });
  useInstagramForm.setState({ url: "", autoProbe: false });
  useSettings.setState({ settings: { clipboardLastLink: "" } as Settings, update: async () => undefined });
});

describe("openClipboardLink", () => {
  it("fills video links into Video download and checks them", () => {
    openClipboardLink(youtube);
    expect(useDownloadForm.getState()).toMatchObject({ url: youtube.url, tab: "single", autoProbe: true });
    expect(window.location.hash).toBe("#/download");
  });

  it("fills Instagram links into the Instagram tool", () => {
    openClipboardLink(instagram);
    expect(useInstagramForm.getState()).toMatchObject({ url: instagram.url, autoProbe: true });
    expect(useDownloadForm.getState().url).toBe("");
    expect(window.location.hash).toBe("#/instagram");
  });

  it("adds several video links to the download queue", () => {
    useDownloadForm.setState({ tab: "single", batchText: "https://youtu.be/old\nhttps://youtu.be/a" });
    openClipboardLink(several);
    expect(useDownloadForm.getState()).toMatchObject({
      tab: "batch",
      batchText: "https://youtu.be/old\nhttps://youtu.be/a\nhttps://x.com/u/status/1",
      autoProbe: false,
    });
    expect(window.location.hash).toBe("#/download");
  });
});

describe("appendToQueue", () => {
  it("skips links already queued and blank lines", () => {
    expect(appendToQueue("", ["https://a", "https://b", "https://a"])).toBe("https://a\nhttps://b");
    expect(appendToQueue(" https://a \n\n", ["https://a", "https://c"])).toBe("https://a\nhttps://c");
  });
});

describe("isNewLink", () => {
  it("offers a link once", () => {
    expect(isNewLink(youtube)).toBe(true);
    useSettings.setState({ settings: { clipboardLastLink: youtube.url } as Settings });
    expect(isNewLink(youtube)).toBe(false);
  });

  it("skips a link already in its tool and an empty clipboard", () => {
    useInstagramForm.setState({ url: instagram.url });
    expect(isNewLink(instagram)).toBe(false);
    expect(isNewLink(null)).toBe(false);
  });

  it("offers several links until all of them are queued", () => {
    expect(isNewLink(several)).toBe(true);
    useDownloadForm.setState({ batchText: several.urls.join("\n") });
    expect(isNewLink(several)).toBe(false);
  });
});

describe("linkFromText", () => {
  it("ignores text without a link", () => {
    expect(linkFromText("hello")).toBeNull();
  });

  it("accepts any site for Video download and trims trailing punctuation", () => {
    expect(linkFromText("watch https://vimeo.com/123.")).toEqual({ url: "https://vimeo.com/123", target: "download" });
  });

  it("sends Instagram links to the Instagram tool", () => {
    expect(linkFromText("https://www.instagram.com/p/xyz/")).toEqual({ url: "https://www.instagram.com/p/xyz/", target: "instagram" });
  });

  it("queues several video links without repeats", () => {
    expect(linkFromText("https://youtu.be/a https://youtu.be/b https://youtu.be/a")).toEqual({
      url: "https://youtu.be/a",
      target: "download",
      urls: ["https://youtu.be/a", "https://youtu.be/b"],
    });
  });
});

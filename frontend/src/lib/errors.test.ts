import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { errorMessage } from "./errors";

beforeAll(() => i18n.changeLanguage("en"));

describe("errorMessage", () => {
  it("shows the backend's message without the error type", () => {
    const err = new Error("SHA-256 mismatch for model.pth");
    err.name = "ValueError";
    expect(String(err)).toBe("ValueError: SHA-256 mismatch for model.pth");
    expect(errorMessage(i18n.t, err)).toBe("SHA-256 mismatch for model.pth");
    expect(errorMessage(i18n.t, "Error: offline")).toBe("offline");
  });

  it("translates i18n keys sent by the backend", () => {
    expect(errorMessage(i18n.t, new Error("errors.bootTimeout"))).toBe(i18n.t("errors.bootTimeout"));
  });

  it("falls back to a generic text", () => {
    expect(errorMessage(i18n.t, undefined)).toBe(i18n.t("errors.unknown"));
    expect(errorMessage(i18n.t, new Error(""))).toBe(i18n.t("errors.unknown"));
    expect(errorMessage(i18n.t, { message: "from an object" })).toBe("from an object");
  });
});

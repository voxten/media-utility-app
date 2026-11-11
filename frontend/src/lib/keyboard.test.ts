import { describe, expect, it } from "vitest";
import { hasCommandModifier, isTypingTarget } from "./keyboard";

describe("isTypingTarget", () => {
  it("recognises text fields", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("ignores other elements and non-elements", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});

describe("hasCommandModifier", () => {
  it("is true for Ctrl, Alt and Meta, not for Shift", () => {
    expect(hasCommandModifier(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(true);
    expect(hasCommandModifier(new KeyboardEvent("keydown", { key: "c", altKey: true }))).toBe(true);
    expect(hasCommandModifier(new KeyboardEvent("keydown", { key: "c", metaKey: true }))).toBe(true);
    expect(hasCommandModifier(new KeyboardEvent("keydown", { key: "C", shiftKey: true }))).toBe(false);
  });
});

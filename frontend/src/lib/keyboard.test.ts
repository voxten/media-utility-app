import { describe, expect, it } from "vitest";
import { hasCommandModifier, isTypingTarget, toolShortcut } from "./keyboard";

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

describe("toolShortcut", () => {
  const press = (init: KeyboardEventInit, target?: HTMLElement) => {
    const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
    if (target) Object.defineProperty(event, "target", { value: target });
    return event;
  };

  it("maps Ctrl+Enter, Ctrl+O and Escape", () => {
    expect(toolShortcut(press({ key: "Enter", ctrlKey: true }))).toBe("run");
    expect(toolShortcut(press({ key: "O", ctrlKey: true }))).toBe("open");
    expect(toolShortcut(press({ key: "Escape" }))).toBe("cancel");
  });

  it("runs from a text field but does not cancel from one", () => {
    const textarea = document.createElement("textarea");
    expect(toolShortcut(press({ key: "Enter", ctrlKey: true }, textarea))).toBe("run");
    expect(toolShortcut(press({ key: "Escape" }, textarea))).toBeNull();
  });

  it("ignores plain Enter, other modifiers, repeats and handled events", () => {
    expect(toolShortcut(press({ key: "Enter" }))).toBeNull();
    expect(toolShortcut(press({ key: "Enter", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(toolShortcut(press({ key: "o", ctrlKey: true, altKey: true }))).toBeNull();
    expect(toolShortcut(press({ key: "Escape", repeat: true }))).toBeNull();
    const handled = press({ key: "Escape" });
    handled.preventDefault();
    expect(toolShortcut(handled)).toBeNull();
  });

  it("leaves keys to an open dialog or menu", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div role="dialog"></div>';
    expect(toolShortcut(press({ key: "Escape" }), root)).toBeNull();
    expect(toolShortcut(press({ key: "Enter", ctrlKey: true }), root)).toBeNull();
    root.innerHTML = '<button role="combobox" aria-expanded="true"></button>';
    expect(toolShortcut(press({ key: "Escape" }), root)).toBeNull();
  });

  it("is not blocked by a file list or a closed dropdown", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div role="listbox"></div><button role="combobox" aria-expanded="false"></button>';
    expect(toolShortcut(press({ key: "Escape" }), root)).toBe("cancel");
    expect(toolShortcut(press({ key: "o", ctrlKey: true }), root)).toBe("open");
  });
});

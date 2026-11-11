import { beforeEach, describe, expect, it } from "vitest";
import { useTransferStore } from "../stores/transfer";
import { emitLocal } from "./bridge";
import { claimDrop } from "./drop";

const initial = useTransferStore.getState();

function dropEvent(names: string[]) {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
  const files = names.map((name) => new File(["x"], name));
  Object.defineProperty(event, "dataTransfer", { value: { files, types: ["Files"] } });
  return event;
}

beforeEach(() => useTransferStore.setState(initial, true));

describe("window-wide drop", () => {
  it("offers tools for native paths no drop zone claimed", () => {
    emitLocal("files:dropped", { paths: ["C:\\in\\a.png", "C:\\in\\b.pdf"] });
    expect(useTransferStore.getState()).toMatchObject({
      isModalOpen: true,
      modalFiles: ["C:\\in\\a.png", "C:\\in\\b.pdf"],
      origin: "drop",
      sourceToolId: undefined,
    });
  });

  it("ignores an empty native drop", () => {
    emitLocal("files:dropped", { paths: [] });
    expect(useTransferStore.getState().isModalOpen).toBe(false);
  });

  it("offers tools for a drop outside every zone (mock backend)", () => {
    document.body.dispatchEvent(dropEvent(["photo.jpg"]));
    expect(useTransferStore.getState()).toMatchObject({ isModalOpen: true, modalFiles: ["C:\\mock\\photo.jpg"] });
  });

  it("leaves a drop to the zone that handled it", () => {
    const zone = document.createElement("div");
    document.body.append(zone);
    let received: string[] = [];
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      claimDrop(e as DragEvent, (paths) => (received = paths));
    });

    zone.dispatchEvent(dropEvent(["clip.mp4"]));
    expect(received).toEqual(["C:\\mock\\clip.mp4"]);
    expect(useTransferStore.getState().isModalOpen).toBe(false);
    zone.remove();
  });
});

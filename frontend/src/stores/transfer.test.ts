import { beforeEach, describe, expect, it } from "vitest";
import { useTransferStore } from "./transfer";

const initial = useTransferStore.getState();

beforeEach(() => useTransferStore.setState(initial, true));

describe("transfer store", () => {
  it("opens the dialog with a single path or a list, ignoring empty entries", () => {
    useTransferStore.getState().openModal("C:\\a.png", "converter");
    expect(useTransferStore.getState()).toMatchObject({ isModalOpen: true, modalFiles: ["C:\\a.png"], sourceToolId: "converter" });

    useTransferStore.getState().openModal(["", "C:\\b.png"]);
    expect(useTransferStore.getState().modalFiles).toEqual(["C:\\b.png"]);
  });

  it("does not open for nothing", () => {
    useTransferStore.getState().openModal([]);
    expect(useTransferStore.getState().isModalOpen).toBe(false);
  });

  it("keeps the files while closing so the exit animation has content", () => {
    useTransferStore.getState().openModal("C:\\a.png");
    useTransferStore.getState().closeModal();
    expect(useTransferStore.getState()).toMatchObject({ isModalOpen: false, modalFiles: ["C:\\a.png"] });
  });

  it("hands a transfer only to its target tool, once", () => {
    const store = useTransferStore.getState();
    store.openModal("C:\\a.png", "converter");
    store.sendToTool("compressor", ["C:\\a.png"], "batch");

    expect(useTransferStore.getState().isModalOpen).toBe(false);
    expect(useTransferStore.getState().consumeTransfer("upscale")).toBeNull();

    const payload = useTransferStore.getState().consumeTransfer("compressor");
    expect(payload).toMatchObject({ files: ["C:\\a.png"], sourceToolId: "converter", targetToolId: "compressor", targetSubTab: "batch" });
    expect(useTransferStore.getState().consumeTransfer("compressor")).toBeNull();
  });
});

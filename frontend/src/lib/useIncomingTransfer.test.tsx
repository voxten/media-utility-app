import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useIncomingTransfer } from "./useIncomingTransfer";
import { useTransferStore } from "../stores/transfer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notify = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock("../components/notify", () => ({ useNotify: () => notify }));

function Compressor({ onAccept }: { onAccept: (files: string[]) => void }) {
  useIncomingTransfer("compressor", onAccept);
  return null;
}

describe("useIncomingTransfer", () => {
  it("takes files sent to the tool that is already open", () => {
    const onAccept = vi.fn();
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Compressor onAccept={onAccept} />));
    expect(onAccept).not.toHaveBeenCalled();

    act(() => useTransferStore.getState().sendToTool("compressor", ["C:/a.jpg"]));
    expect(onAccept).toHaveBeenCalledWith(["C:/a.jpg"], undefined);
    expect(useTransferStore.getState().pendingTransfer).toBeNull();

    act(() => useTransferStore.getState().sendToTool("converter", ["C:/b.jpg"]));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(useTransferStore.getState().pendingTransfer?.targetToolId).toBe("converter");
    act(() => root.unmount());
  });
});

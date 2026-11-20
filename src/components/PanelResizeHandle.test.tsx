// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceView } from "@/lib/workspace-view";
import { PanelResizeHandle } from "./PanelResizeHandle";

// The interface scale is 1 wherever matchMedia is missing, so the tests that
// need another one set it here.
const scale = vi.hoisted(() => ({ value: 1 }));
vi.mock("@/lib/ui-scale", async (original) => ({
  ...(await original<typeof import("@/lib/ui-scale")>()),
  getUiScale: () => scale.value,
}));

afterEach(() => {
  cleanup();
  scale.value = 1;
});

function stored(): number | undefined {
  return (
    JSON.parse(window.localStorage.getItem("gtnh-factory-flow-workspace-view") ?? "{}") as {
      rightPanelWidth?: number;
    }
  ).rightPanelWidth;
}

/** jsdom lays nothing out, so the handle starts a drag from the width it is given. */
function mount(width: number) {
  const onPreview = vi.fn<(width: number) => void>();
  const { unmount } = render(<PanelResizeHandle width={width} onPreview={onPreview} />);
  return { handle: screen.getByRole("separator"), onPreview, unmount };
}

describe("the right column's resize handle", () => {
  beforeEach(() => {
    writeWorkspaceView({ rightPanelWidth: 234 });
  });

  it("widens the column as the handle is dragged left, and stores it on release", () => {
    const { handle, onPreview } = mount(234);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(334);
    // Nothing is stored mid-drag: a write repaints every workspace reader.
    expect(stored()).toBe(234);

    fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });
    expect(stored()).toBe(334);
  });

  it("narrows the column as the handle is dragged right", () => {
    const { handle, onPreview } = mount(400);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 560, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(340);
  });

  it("stops at the column's limits", () => {
    const { handle, onPreview } = mount(300);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -2000, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(520);
    fireEvent.pointerMove(handle, { clientX: 2000, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(234);
  });

  it("keeps the width and lets go when the drag is cancelled", () => {
    const { handle, onPreview } = mount(234);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(stored()).toBe(284);

    onPreview.mockClear();
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("does not follow a pointer that never pressed it", () => {
    const { handle, onPreview } = mount(234);
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("divides the pointer's travel by the interface scale", () => {
    // The pointer moves in real px and the width is shell px: at 150%, 150
    // real px of travel is 100 px of column.
    scale.value = 1.5;
    const { handle, onPreview } = mount(234);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 350, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(334);
  });

  it("starts from the width on screen when a narrow window holds the column under its stored width", () => {
    writeWorkspaceView({ rightPanelWidth: 520 });
    const { handle, onPreview } = mount(520);
    Object.defineProperty(handle.parentElement, "offsetWidth", { value: 364, configurable: true });
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 520, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(344);
  });

  it("keeps the width when the browser takes the pointer away", () => {
    const { handle, onPreview } = mount(234);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 440, pointerId: 1 });
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    expect(stored()).toBe(294);

    onPreview.mockClear();
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("stores nothing for a press that never moved", () => {
    // On a narrow window the column sits under its stored width; a click on
    // the handle must not quietly store the narrower one.
    writeWorkspaceView({ rightPanelWidth: 520 });
    const { handle } = mount(520);
    Object.defineProperty(handle.parentElement, "offsetWidth", { value: 364, configurable: true });
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 500, pointerId: 1 });
    expect(stored()).toBe(520);
  });

  it("keeps the previewed width when the column goes away mid-drag", () => {
    // The preview is painted outside React, so a drag that never ends would
    // leave the grid at a width the workspace view does not hold.
    const { handle, unmount } = mount(234);
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    unmount();
    expect(stored()).toBe(334);
  });

  it("returns to 234 on a double click", () => {
    writeWorkspaceView({ rightPanelWidth: 400 });
    const { handle } = mount(400);
    fireEvent.doubleClick(handle);
    expect(stored()).toBe(234);
  });

  it("steps 16 with the arrow keys", () => {
    const { handle } = mount(300);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(stored()).toBe(316);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(stored()).toBe(284);
  });

  it("tells assistive tech its range and where it is", () => {
    const { handle } = mount(300);
    expect(handle.getAttribute("aria-valuemin")).toBe("234");
    expect(handle.getAttribute("aria-valuemax")).toBe("520");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceView } from "@/lib/workspace-view";
import { PanelResizeHandle } from "./PanelResizeHandle";

afterEach(cleanup);

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
  render(<PanelResizeHandle width={width} onPreview={onPreview} />);
  return { handle: screen.getByRole("separator"), onPreview };
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

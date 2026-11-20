"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { useT } from "@/lib/i18n";
import { getUiScale } from "@/lib/ui-scale";
import {
  clampRightPanelWidth,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  setRightPanelWidth,
} from "@/lib/workspace-view";

/** One arrow-key press, in shell px. */
const KEY_STEP = 16;

interface Drag {
  startX: number;
  startWidth: number;
  last: number;
}

/** Ends a drag, if one is under way, and stores the width it reached. */
function settleDrag(drag: RefObject<Drag | null>) {
  const current = drag.current;
  drag.current = null;
  if (current && current.last !== current.startWidth) {
    setRightPanelWidth(current.last);
  }
}

/**
 * The grip on the right column's left edge: drag it to set the column's width.
 *
 * A drag paints through `onPreview` and stores the width once, on release. A
 * store write repaints every reader of the workspace view, and a drag is a
 * write per pointer move; the owner paints a preview with one style write
 * instead.
 *
 * The pointer moves in real px and the width is shell px, so the travel is
 * divided by the interface scale.
 */
export function PanelResizeHandle({
  width,
  onPreview,
}: {
  /** The stored width, in shell px. */
  width: number;
  /** Each width a drag passes through, already clamped. */
  onPreview: (width: number) => void;
}) {
  const t = useT();
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    // A press that starts a drag must not start a text selection too.
    event.preventDefault();
    const handle = event.currentTarget;
    // Capture keeps the moves coming once the pointer is off the strip, and
    // ends the drag here even when the button is let go outside the window.
    handle.setPointerCapture?.(event.pointerId);
    // Start from the width on screen: a narrow window can hold the column
    // under its stored width, and the edge must not jump to catch up.
    const startWidth = clampRightPanelWidth(handle.parentElement?.offsetWidth || width);
    drag.current = { startX: event.clientX, startWidth, last: startWidth };
    setDragging(true);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    // The column grows leftward, so travel to the left is width gained.
    const next = clampRightPanelWidth(
      current.startWidth + (current.startX - event.clientX) / getUiScale(),
    );
    if (next !== current.last) {
      current.last = next;
      onPreview(next);
    }
  };

  // Release, cancel and a lost capture all end the drag the same way: the
  // width the player last saw is the width that is kept. A press that never
  // moved stores nothing: on a narrow window the column sits under its stored
  // width, and a click must not quietly store the narrower one.
  const end = () => {
    if (drag.current) {
      setDragging(false);
      settleDrag(drag);
    }
  };
  // The preview is painted outside React. If the column goes away mid-drag
  // (hidden by a key or a second finger), no release ever arrives, so the
  // previewed width is stored here; otherwise the grid would keep a width the
  // workspace view does not hold.
  useEffect(() => () => settleDrag(drag), []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    setRightPanelWidth(width + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP));
  };

  const label = t("Drag to resize. Double-click to reset.");
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
      aria-valuemax={RIGHT_PANEL_MAX_WIDTH}
      aria-valuenow={width}
      title={label}
      tabIndex={0}
      data-panel-resize
      data-dragging={dragging ? "" : undefined}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => setRightPanelWidth(RIGHT_PANEL_MIN_WIDTH)}
      onKeyDown={onKeyDown}
      // The short bar at mid-height is always drawn: a remembered width needs
      // a control the player can see, not one that only appears under the pointer.
      className="absolute inset-y-0 left-0 z-20 w-[6px] cursor-col-resize touch-none outline-none transition-colors after:absolute after:left-[2px] after:top-1/2 after:h-8 after:w-[2px] after:-translate-y-1/2 after:rounded-full after:bg-white/30 hover:bg-cyan-500/50 focus-visible:bg-cyan-500/50 data-[dragging]:bg-cyan-400/70"
    />
  );
}

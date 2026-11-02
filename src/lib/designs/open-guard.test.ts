import { afterEach, describe, expect, it, vi } from "vitest";
import { afterPaintAndIdle, isSafeModeAddress } from "./open-guard";

afterEach(() => {
  vi.useRealTimers();
});

describe("a plan counts as opened once the page is responsive", () => {
  it("settles after three on-time ticks, animation or not", () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    afterPaintAndIdle(settled);
    vi.advanceTimersByTime(1000);
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("waits while the main thread is busy: a late tick starts the count again", () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    afterPaintAndIdle(settled);
    for (let busy = 0; busy < 10; busy += 1) {
      // Each tick arrives seconds late, as behind a long task.
      vi.setSystemTime(Date.now() + 5000);
      vi.advanceTimersByTime(500);
    }
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(settled).toHaveBeenCalledTimes(1);
  });
});

describe("safe mode", () => {
  it("is #safe or ?safe in the address", () => {
    expect(isSafeModeAddress({ hash: "#safe", search: "" })).toBe(true);
    expect(isSafeModeAddress({ hash: "", search: "?safe" })).toBe(true);
    expect(isSafeModeAddress({ hash: "#p=gtnh1.abc", search: "" })).toBe(false);
    expect(isSafeModeAddress({ hash: "", search: "" })).toBe(false);
  });
});

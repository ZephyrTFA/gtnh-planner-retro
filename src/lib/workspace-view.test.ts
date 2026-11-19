// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  toggleResourceFavourite,
  toggleResourceHidden,
  writeWorkspaceView,
} from "./workspace-view";

/**
 * The module caches its snapshot after the first read, so these drive it
 * through the same writers the UI uses rather than reloading it.
 */
function current() {
  return JSON.parse(
    window.localStorage.getItem("gtnh-factory-flow-workspace-view") ?? "{}",
  ) as { hiddenResourceKeys: string[]; favouriteResourceKeys: string[] };
}

describe("workspace view resource marks", () => {
  beforeEach(() => {
    writeWorkspaceView({ hiddenResourceKeys: [], favouriteResourceKeys: [] });
  });

  it("hides and unhides a resource", () => {
    toggleResourceHidden("item:iron");
    expect(current().hiddenResourceKeys).toEqual(["item:iron"]);

    toggleResourceHidden("item:iron");
    expect(current().hiddenResourceKeys).toEqual([]);
  });

  it("unhides a resource when it is starred", () => {
    toggleResourceHidden("item:iron");
    toggleResourceFavourite("item:iron");

    // The whole point: a star means "keep this in front of me", so it cannot
    // leave the resource sitting in the hidden list waiting to vanish again.
    expect(current().favouriteResourceKeys).toEqual(["item:iron"]);
    expect(current().hiddenResourceKeys).toEqual([]);
  });

  it("leaves other hidden resources alone when starring one", () => {
    toggleResourceHidden("item:iron");
    toggleResourceHidden("fluid:water");
    toggleResourceFavourite("item:iron");

    expect(current().hiddenResourceKeys).toEqual(["fluid:water"]);
  });

  it("does not re-hide a resource when its star is taken away", () => {
    toggleResourceHidden("item:iron");
    toggleResourceFavourite("item:iron");
    toggleResourceFavourite("item:iron");

    // Unstarring returns it to the plain list, not to the hidden one it left.
    expect(current().favouriteResourceKeys).toEqual([]);
    expect(current().hiddenResourceKeys).toEqual([]);
  });

  it("keeps the two lists exclusive across several resources", () => {
    toggleResourceHidden("item:a");
    toggleResourceHidden("item:b");
    toggleResourceFavourite("item:b");
    toggleResourceFavourite("item:c");

    const state = current();
    const overlap = state.hiddenResourceKeys.filter((key) =>
      state.favouriteResourceKeys.includes(key),
    );
    expect(overlap).toEqual([]);
    expect(state.hiddenResourceKeys).toEqual(["item:a"]);
    expect(state.favouriteResourceKeys).toEqual(["item:b", "item:c"]);
  });
});

describe("the right column's tab", () => {
  /** The reader validates the stored blob, so it gets a fresh module. */
  async function readStored() {
    vi.resetModules();
    const fresh = await import("./workspace-view");
    return fresh.readWorkspaceViewSnapshot().rightPanelTab;
  }

  it("keeps the tab the player left the column on", async () => {
    window.localStorage.setItem(
      "gtnh-factory-flow-workspace-view",
      JSON.stringify({ rightPanelTab: "tasks" }),
    );
    expect(await readStored()).toBe("tasks");
  });

  it("falls back to resources for a tab the column does not have", async () => {
    window.localStorage.setItem(
      "gtnh-factory-flow-workspace-view",
      JSON.stringify({ rightPanelTab: "settings" }),
    );
    expect(await readStored()).toBe("resources");
  });

  it("defaults to resources when the blob predates the tab", async () => {
    window.localStorage.setItem(
      "gtnh-factory-flow-workspace-view",
      JSON.stringify({ rightPanelOpen: true }),
    );
    expect(await readStored()).toBe("resources");
  });
});

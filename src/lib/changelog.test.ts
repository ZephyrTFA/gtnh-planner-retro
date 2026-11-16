import { describe, expect, it } from "vitest";
import { CHANGELOG } from "./changelog";
import { compareVersions } from "./whats-new";
import { APP_VERSION } from "./version";

describe("the changelog", () => {
  it("is newest first", () => {
    // The dialog renders the array in the order it is written; nothing sorts
    // it, so a release appended at the bottom reads as the oldest one.
    const order = CHANGELOG.map((entry) => entry.version);
    expect(order).toEqual([...order].sort((a, b) => compareVersions(b, a)));
  });

  it("opens on the release that is live", () => {
    expect(CHANGELOG[0]?.version).toBe(APP_VERSION);
  });

  it("says something for players in every entry", () => {
    for (const entry of CHANGELOG) {
      expect(entry.headline.trim().length).toBeGreaterThan(0);
      expect(entry.notes.length).toBeGreaterThan(0);
      for (const note of entry.notes) {
        expect(note.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

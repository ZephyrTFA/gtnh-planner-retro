import { expect, it } from "vitest";
import { latestStableVersionId, orderManifestVersions } from "./manifest-order.mjs";

const version = (id, gtnhVersion, publishedAt, addonSet) => ({
  id,
  gtnhVersion,
  channel: "stable",
  publishedAt,
  ...(addonSet ? { addonSet } : {}),
});

it("keeps the plain pack ahead of its addon sets, and the default on the plain pack", () => {
  const plain = version("stable-2.9.0", "2.9.0", "2026-11-02T23:00:00Z");
  const tst = version("stable-2.9.0-tst", "2.9.0", "2026-11-03T05:00:00Z", { id: "tst", label: "Twist Space Technology", mods: [] });
  const older = version("stable-2.8.4", "2.8.4", "2026-11-04T00:00:00Z");

  const ordered = orderManifestVersions([tst, older, plain]);
  expect(ordered.map((entry) => entry.id)).toEqual(["stable-2.9.0", "stable-2.9.0-tst", "stable-2.8.4"]);
  expect(latestStableVersionId(ordered)).toBe("stable-2.9.0");
});

it("falls back to an addon dataset when no plain stable pack exists", () => {
  const tst = version("stable-2.9.0-tst", "2.9.0", "2026-11-03T05:00:00Z", { id: "tst", label: "TST", mods: [] });
  expect(latestStableVersionId(orderManifestVersions([tst]))).toBe("stable-2.9.0-tst");
});

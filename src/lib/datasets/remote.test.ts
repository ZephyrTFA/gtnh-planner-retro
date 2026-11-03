import { describe, expect, it } from "vitest";
import { datasetVersionForAddonSet, datasetVersionLabel, pickDefaultDatasetVersion } from "./remote";
import type { DatasetManifest } from "./types";

describe("remote dataset selection", () => {
  it("prefers the latest stable dataset over a daily dataset", () => {
    const manifest: DatasetManifest = {
      schemaVersion: 1,
      latestStableVersion: "stable-2.8.4",
      latestDailyVersion: "daily-523",
      versions: [
        datasetVersion("daily-523", "daily"),
        datasetVersion("stable-2.8.4", "stable"),
      ],
    };

    expect(pickDefaultDatasetVersion(manifest)?.id).toBe("stable-2.8.4");
  });

  it("opens a plan on the dataset of its addon set, and a plain plan on the plain pack", () => {
    const tst = { id: "tst", label: "Twist Space Technology", mods: [{ name: "Twist Space Technology", version: "0.8.0" }] };
    const manifest: DatasetManifest = {
      schemaVersion: 1,
      latestStableVersion: "stable-2.9.0",
      versions: [
        datasetVersion("stable-2.9.0", "stable"),
        { ...datasetVersion("stable-2.9.0-tst", "stable"), gtnhVersion: "2.9.0", addonSet: tst },
      ],
    };

    expect(datasetVersionForAddonSet(manifest, "tst")?.id).toBe("stable-2.9.0-tst");
    expect(datasetVersionForAddonSet(manifest, undefined)?.id).toBe("stable-2.9.0");
    expect(datasetVersionForAddonSet(manifest, "gtnl")).toBeUndefined();
    expect(datasetVersionLabel(manifest.versions[1]!)).toBe("2.9.0 + Twist Space Technology");
    expect(datasetVersionLabel({ ...manifest.versions[0]!, gtnhVersion: "2.9.0" })).toBe("2.9.0");
  });
});

function datasetVersion(id: string, channel: "stable" | "daily") {
  return {
    id,
    gtnhVersion: id,
    channel,
    publishedAt: "2026-05-20T00:00:00.000Z",
    manifestPath: "/datasets/gtnh/datasets.manifest.json",
    recipeDatasetPath: `/datasets/gtnh/${id}/recipes.json.gz`,
    sourceInfo: {
      sourceId: "recex" as const,
      generatedAt: "2026-05-20T00:00:00.000Z",
    },
  };
}

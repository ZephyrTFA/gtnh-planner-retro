import { describe, expect, it } from "vitest";
import { machineAddon } from "./addon-machines";

const face = { kind: "item" as const, id: "gregtech:gt.blockmachines@1" };
const icons = {
  machineHandlerIcons: [
    { familyId: "magnetic-drive-pressure-former", resource: face, addon: "Twist Space Technology" },
    { familyId: "forming-press", resource: face },
  ],
  recipeMapIcons: [
    { recipeMap: "Coking Factory Recipes", resource: face, addon: "Twist Space Technology" },
    { recipeMap: "Forming Press", resource: face },
  ],
};

describe("machineAddon", () => {
  it("names the addon of a chosen handler family, even on a pack map", () => {
    const recipe = {
      machineType: "Forming Press",
      source: { recipeMap: "Forming Press" },
      machineHandlers: [
        { id: "forming-press", label: "Forming Press", machineType: "Forming Press", minimumTier: "LV" },
        { id: "magnetic-drive-pressure-former", label: "Magnetic Drive Pressure Former", machineType: "Magnetic Drive Pressure Former", minimumTier: "LV" },
      ],
    };
    expect(machineAddon(icons, recipe, "magnetic-drive-pressure-former")).toBe("Twist Space Technology");
    expect(machineAddon(icons, recipe, "forming-press")).toBeUndefined();
  });

  it("falls back to the map for a one-machine map whose card runs on a placeholder", () => {
    const recipe = { machineType: "Coking Factory Recipes", source: { recipeMap: "Coking Factory Recipes" } };
    expect(machineAddon(icons, recipe, "coking-factory-recipes")).toBe("Twist Space Technology");
  });

  it("says nothing on a pack dataset", () => {
    const recipe = { machineType: "Forming Press", source: { recipeMap: "Forming Press" } };
    expect(machineAddon({}, recipe, "forming-press")).toBeUndefined();
    expect(machineAddon(icons, recipe, "forming-press")).toBeUndefined();
  });
});

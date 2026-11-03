import { afterEach, expect, it } from "vitest";
import { displayNameFor, resourceDisplayLabel, resourceLabel, setResourceDisplayNames } from "./resources";

afterEach(() => setResourceDisplayNames(undefined));

it("translates names for display only; resourceLabel, which plans store, stays English", () => {
  setResourceDisplayNames(new Map([["minecraft:iron_ingot", "Железный слиток"]]));
  const iron = { id: "minecraft:iron_ingot", displayName: "Iron Ingot" };

  expect(resourceDisplayLabel(iron)).toBe("Железный слиток");
  expect(displayNameFor(iron.id, iron.displayName)).toBe("Железный слиток");
  expect(resourceLabel(iron)).toBe("Iron Ingot");
  // Untranslated names fall back to English.
  expect(resourceDisplayLabel({ id: "gregtech:volcanus", displayName: "Volcanus" })).toBe("Volcanus");
});

it("leaves ore dictionary groups to their English wording", () => {
  setResourceDisplayNames(new Map([["oredict:ingotIron", "Что-то"]]));
  expect(resourceDisplayLabel({ id: "oredict:ingotIron", displayName: "Ore Dictionary: ingotIron" })).toBe(
    resourceLabel({ id: "oredict:ingotIron", displayName: "Ore Dictionary: ingotIron" }),
  );
});

it("shows English again once the overlay is cleared", () => {
  setResourceDisplayNames(new Map([["minecraft:iron_ingot", "Железный слиток"]]));
  setResourceDisplayNames(undefined);
  expect(resourceDisplayLabel({ id: "minecraft:iron_ingot", displayName: "Iron Ingot" })).toBe("Iron Ingot");
});

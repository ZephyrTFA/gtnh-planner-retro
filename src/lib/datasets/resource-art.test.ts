import { describe, expect, it } from "vitest";
import { applyResourceArt, collectResourceArtKeys, isForeignDatasetArt } from "./resource-art";

const sheet = (x: number) => ({
  imagePath: "/datasets/gtnh/stable-2.9.0/textures/sheets/sheet-0123456789abcdef.webp",
  atlasWidth: 1024,
  atlasHeight: 1024,
  x,
  y: 0,
  width: 128,
  height: 128,
});

/** A plan made on gtnhplanner.com: its art names that site's RC-2 loose icons. */
const oldPlan = {
  name: "Steel line",
  icon: { kind: "item", id: "gregtech:ingotSteel", iconPath: "/datasets/gtnh/local-2.9.0-rc-2/textures/rendered/steel_ingot-aaa.png" },
  recipes: [
    {
      id: "r1",
      inputs: [
        {
          kind: "item",
          id: "minecraft:iron_ingot",
          amount: 1,
          displayName: "Iron Ingot",
          iconPath: "/datasets/gtnh/local-2.9.0-rc-2/textures/rendered/iron_ingot-bbb.png",
          dominantColor: "#cccccc",
        },
        { kind: "aspect", id: "thaumcraft:aspect:aer", amount: 1, iconPath: "/nei/thaumcraft/aspects/aer.png" },
      ],
      outputs: [
        {
          kind: "item",
          id: "mod:gone",
          amount: 1,
          displayName: "Removed item",
          iconPath: "/datasets/gtnh/local-2.9.0-rc-2/textures/rendered/gone-ccc.png",
        },
      ],
    },
  ],
  storages: [{ id: "s1", kind: "item", resourceId: "minecraft:iron_ingot", iconPath: "/datasets/gtnh/local-2.9.0-rc-2/textures/rendered/iron_ingot-bbb.png" }],
  nodes: [{ id: "n1", position: { x: 0, y: 0 } }],
};

describe("resource art from the current dataset", () => {
  it("finds every resource a plan draws", () => {
    expect(collectResourceArtKeys(oldPlan).sort()).toEqual([
      "aspect:thaumcraft:aspect:aer",
      "item:gregtech:ingotSteel",
      "item:minecraft:iron_ingot",
      "item:mod:gone",
    ]);
  });

  it("redraws an old plan with this dataset's sheets and drops art this site cannot serve", () => {
    const plan = applyResourceArt(oldPlan, {
      "item:gregtech:ingotSteel": { iconAtlas: sheet(0), dominantColor: "#808080" },
      "item:minecraft:iron_ingot": { iconAtlas: sheet(128), dominantColor: "#d8d8d8" },
      "aspect:thaumcraft:aspect:aer": { iconPath: "/nei/thaumcraft/aspects/aer.png" },
      "item:mod:gone": null,
    });

    expect(plan.icon).toEqual({ kind: "item", id: "gregtech:ingotSteel", iconAtlas: sheet(0), dominantColor: "#808080" });
    const [iron, aer] = plan.recipes[0]!.inputs;
    expect(iron).toMatchObject({ iconAtlas: sheet(128), dominantColor: "#d8d8d8", displayName: "Iron Ingot", amount: 1 });
    expect(iron).not.toHaveProperty("iconPath");
    // Already right: the very same object.
    expect(aer).toBe(oldPlan.recipes[0]!.inputs[1]);
    const gone = plan.recipes[0]!.outputs[0]!;
    expect(gone).not.toHaveProperty("iconPath");
    expect(gone.displayName).toBe("Removed item");
    expect(plan.storages[0]).toMatchObject({ resourceId: "minecraft:iron_ingot", iconAtlas: sheet(128) });
    expect(plan.nodes).toBe(oldPlan.nodes);
  });

  it("returns an up-to-date plan unchanged", () => {
    const current = { recipes: [{ inputs: [{ kind: "item", id: "a", iconAtlas: sheet(0) }] }] };
    expect(applyResourceArt(current, { "item:a": { iconAtlas: sheet(0) } })).toBe(current);
  });

  it("tells foreign dataset art from this dataset's and from site art", () => {
    expect(isForeignDatasetArt({ iconPath: "/datasets/gtnh/local-2.9.0-beta-2/textures/rendered/x.png" }, "stable-2.9.0")).toBe(true);
    expect(isForeignDatasetArt({ iconAtlas: sheet(0) }, "stable-2.9.0")).toBe(false);
    expect(isForeignDatasetArt({ iconPath: "/nei/thaumcraft/aspects/aer.png" }, "stable-2.9.0")).toBe(false);
  });
});

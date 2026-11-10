import { describe, expect, it } from "vitest";
import {
  CATALYST_DURABILITY,
  catalystWearChance,
  catalystWears,
  catalystsPerParallel,
  runsPerCatalyst,
} from "./chemical-plant";
import { applyRecipeInputOverrides } from "@/lib/model/recipe-input-overrides";
import { calculateThroughput } from "@/lib/solver/throughput";
import { PROJECT_SCHEMA_VERSION, type FactoryNode, type FactoryProject, type Recipe } from "@/lib/model/types";

// GT5U 5.09.54.265 (the 2.9.0 pack), MTEChemicalPlant#damageCatalyst: per parallel, a
// 1.2f - 0.2 x pipe tier chance of 1 damage; 50 damage breaks the catalyst, returns an
// Empty Catalyst Carrier and ends that run's wear. Awakened Draconium + Tungstensteel stops it.

const CATALYST = "miscutils:item.basicgenericchemitem@13";
const CARRIER = "miscutils:item.basicagrichemitem@13";

/** The dataset's 1,1-Dimethylhydrazine recipe: Formaldehyde Catalyst, not consumed. */
const dimethylhydrazine: Recipe = {
  id: "chemplant-udmh",
  name: "Chemical Plant: 1,1-Dimethylhydrazine",
  machineType: "Chemical Plant",
  minimumTier: "MV",
  durationTicks: 1200,
  eut: 120,
  source: { datasetVersionId: "stable-2.9.0", recipeMap: "Chemical Plant", exporter: "gtnh-oracle" },
  inputs: [
    { kind: "item", id: CATALYST, amount: 1, displayName: "Formaldehyde Catalyst", consumed: false },
    { kind: "item", id: "gregtech:gt.integrated_circuit@21", amount: 1, consumed: false },
    { kind: "fluid", id: "fluid.hydrazine", amount: 2000 },
    { kind: "fluid", id: "fluid.formaldehyde", amount: 2000 },
    { kind: "fluid", id: "hydrogen", amount: 4000 },
  ],
  outputs: [
    { kind: "fluid", id: "1,1dimethylhydrazine", amount: 2000 },
    { kind: "fluid", id: "water", amount: 2000 },
  ],
} as Recipe;

function node(tiers: Record<string, string>, extra: Partial<FactoryNode> = {}): FactoryNode {
  return {
    id: "plant",
    recipeId: dimethylhydrazine.id,
    machineCount: 1,
    parallel: 1,
    overclockTier: "EV",
    machineConfigTiers: tiers,
    enabled: true,
    position: { x: 0, y: 0 },
    ...extra,
  } as FactoryNode;
}

/** The Java loop, run for many runs: catalysts broken per run. */
function simulate(chance: number, parallels: number, runs: number): number {
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  let damage = 0;
  let broken = 0;
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < parallels; i++) {
      if (random() < chance) {
        damage += 1;
        if (damage >= CATALYST_DURABILITY) {
          broken += 1;
          damage = 0;
          break;
        }
      }
    }
  }
  return broken / runs;
}

describe("Chemical Plant catalyst wear", () => {
  it("wears 100% / 80% / 60% / 40% of parallels on Bronze / Steel / Titanium / Tungstensteel pipes", () => {
    expect(catalystWearChance(1)).toBe(1);
    expect(catalystWearChance(2)).toBeCloseTo(0.8, 6);
    expect(catalystWearChance(3)).toBeCloseTo(0.6, 6);
    expect(catalystWearChance(4)).toBeCloseTo(0.4, 6);
  });

  it("stops wearing only with Awakened Draconium coils or better and Tungstensteel pipes", () => {
    expect(catalystWears({ coilTier: 10, pipeTier: 4 })).toBe(false);
    expect(catalystWears({ coilTier: 13, pipeTier: 4 })).toBe(false);
    expect(catalystWears({ coilTier: 9, pipeTier: 4 })).toBe(true);
    expect(catalystWears({ coilTier: 10, pipeTier: 3 })).toBe(true);
    expect(catalystsPerParallel({ coilTier: 10, pipeTier: 4, parallels: 8 })).toBe(0);
  });

  it("lasts whole runs: on Bronze every parallel wears, so 50 uses take ceil(50 / parallels) runs", () => {
    expect(runsPerCatalyst(1, 1)).toBeCloseTo(50, 9);
    expect(runsPerCatalyst(1, 2)).toBeCloseTo(25, 9);
    expect(runsPerCatalyst(1, 8)).toBeCloseTo(7, 9);
  });

  it("matches the game's loop, which skips the rest of the run once a catalyst breaks", () => {
    for (const [chance, parallels] of [
      [catalystWearChance(4), 8],
      [catalystWearChance(3), 6],
      [catalystWearChance(2), 3],
    ]) {
      expect(simulate(chance, parallels, 2_000_000) * runsPerCatalyst(chance, parallels)).toBeCloseTo(1, 1);
    }
    // The skipped parallels make a catalyst last longer than 50 / chance parallels.
    expect(runsPerCatalyst(0.4, 8) * 8).toBeGreaterThan(50 / 0.4);
  });

  it("turns the catalyst into a consumed input and gives back a carrier at the same rate", () => {
    const steel = node({ pipeCasing: "steel" }, { coilTier: "kanthal" });
    const recipe = applyRecipeInputOverrides(dimethylhydrazine, steel);
    const perParallel = 1 / (runsPerCatalyst(catalystWearChance(2), 4) * 4);
    const catalyst = recipe.inputs.find((input) => input.id === CATALYST)!;
    expect(catalyst.consumed).toBe(true);
    expect(catalyst.amount).toBeCloseTo(perParallel, 12);
    // Steel pipes, 4 parallels: 80% a parallel; 50 / 3.2 = 15.6 runs, plus the parallels skipped after a break.
    expect(catalyst.machineNotes?.[0]).toBe("Each parallel has a 80% chance to use 1 of its 50 uses. One lasts 16 runs.");
    expect(recipe.outputs.find((output) => output.id === CARRIER)?.amount).toBeCloseTo(perParallel, 12);
    // Applying again changes nothing.
    expect(applyRecipeInputOverrides(recipe, steel)).toBe(recipe);

    const project: FactoryProject = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: "chemplant",
      name: "Chemical Plant",
      recipes: [dimethylhydrazine],
      nodes: [steel],
      edges: [],
      fuelProfiles: [],
    };
    const result = calculateThroughput(project).nodes.plant;
    const hydrazine = result.inputs["fluid:fluid.hydrazine"].amountPerSecond;
    expect(result.inputs[`item:${CATALYST}`].amountPerSecond).toBeCloseTo((hydrazine / 2000) * perParallel, 12);
    expect(result.outputs[`item:${CARRIER}`].amountPerSecond).toBeCloseTo((hydrazine / 2000) * perParallel, 12);
  });

  it("keeps the catalyst unconsumed on Awakened Draconium coils with Tungstensteel pipes", () => {
    const recipe = applyRecipeInputOverrides(
      dimethylhydrazine,
      node({ pipeCasing: "tungstensteel" }, { coilTier: "awakened_draconium" }),
    );
    expect(recipe.inputs.find((input) => input.id === CATALYST)?.consumed).toBe(false);
    expect(recipe.outputs.some((output) => output.id === CARRIER)).toBe(false);
  });

  it("leaves GT Not Leisure's Rockefeller alone: it never wears catalysts", () => {
    const withHandlers = {
      ...dimethylhydrazine,
      machineHandlers: [
        { id: "exxonmobil-chemical-plant", label: "ExxonMobil Chemical Plant", kind: "multiblock", machineType: "ExxonMobil Chemical Plant", minimumTier: "MV" },
        { id: "hand-of-john-davison-rockefeller", label: "Hand of John Davison Rockefeller", kind: "multiblock", machineType: "Hand of John Davison Rockefeller", minimumTier: "MV" },
      ],
    } as Recipe;
    const exxon = applyRecipeInputOverrides(withHandlers, node({ pipeCasing: "steel" }, { machineHandlerId: "exxonmobil-chemical-plant" }));
    expect(exxon.inputs.find((input) => input.id === CATALYST)?.consumed).toBe(true);
    const rockefeller = applyRecipeInputOverrides(
      withHandlers,
      node({}, { machineHandlerId: "hand-of-john-davison-rockefeller" }),
    );
    expect(rockefeller.inputs.find((input) => input.id === CATALYST)?.consumed).toBe(false);
  });
});

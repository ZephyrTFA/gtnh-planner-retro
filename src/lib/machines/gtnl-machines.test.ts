import { describe, expect, it } from "vitest";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { getMachineBehaviour, OVERCLOCK, resolveCoefficient, resolveOverclockSpec, type MachineContext } from "./machine-table";
import { getMachineOutputMultiplier, getMachineParallelMultiplier } from "@/lib/solver/machine-effects";
import { applyMachineHandlerToRecipe } from "@/lib/model/recipe-rules";

// GT Not Leisure's coil machines and TST's Swelegfyr Blast Furnace; each pin
// names the Java it reproduces (WirelessEnergyMultiMachineBase,
// GTMMultiMachineBase and the machine classes in the dev-290 sources).
const ctx = (values: Record<string, number> = {}, extra: Partial<MachineContext> = {}): MachineContext => ({
  tier: (id) => values[id] ?? 0,
  value: (id) => values[id] ?? 0,
  voltageTier: 3,
  ...extra,
});
const of = (name: string) => getMachineBehaviour(name)!;
const speedOf = (name: string, c: MachineContext) => resolveCoefficient(of(name).durationModifier, c, 1);
const powerOf = (name: string, c: MachineContext) => resolveCoefficient(of(name).power, c, 1);
const parallelsOf = (name: string, c: MachineContext) => resolveCoefficient(of(name).parallels, c, 1);

const recipe = (machine: string, eut: number, recipeMap: string, outputs: Recipe["outputs"] = []): Recipe =>
  ({
    id: machine,
    name: recipeMap,
    machineType: recipeMap,
    minimumTier: "LV",
    durationTicks: 200,
    eut,
    inputs: [],
    outputs,
    source: { datasetVersionId: "stable-2.9.0-gtnl", recipeMap, exporter: "test" },
    machineHandlers: [{ id: "m", label: machine, machineType: machine, minimumTier: "LV", kind: "multiblock" }],
  }) as unknown as Recipe;
const node = (settings: Record<string, string> = {}, power: Partial<FactoryNode> = {}): FactoryNode => ({
  id: "n",
  recipeId: "r",
  overclockTier: "LV",
  machineCount: 1,
  parallel: 1,
  enabled: true,
  position: { x: 0, y: 0 },
  machineHandlerId: "m",
  machineConfigTiers: settings,
  ...power,
});

describe("GT Not Leisure coil machines", () => {
  it("wireless family: controller parallels x 16, chip and controller factors, 0.85^coil on duration", () => {
    expect(parallelsOf("Mega Wiremill", ctx())).toBe(8);
    expect(parallelsOf("Mega Wiremill", ctx({ gtnlParallelController: 3 }))).toBe(4 * 16); // HV: maxParallelAt(3) << 4
    const full = ctx({ gtnlParallelController: 3, gtnlWirelessChip: 1, heatingCoil: 2 });
    expect(speedOf("Mega Wiremill", full)).toBe((1.0 / 10.0) * Math.pow(0.75, 3) * Math.pow(0.85, 2));
    expect(powerOf("Mega Wiremill", full)).toBe(0.4 - 3 / 50.0);
    // MagneticEnergyReactionFurnace and PhaseChangeCube: 0.80^coil on both.
    expect(powerOf("Magnetic Energy Reaction Furnace", ctx({ heatingCoil: 2 }))).toBe(0.6 * Math.pow(0.8, 2));
    expect(of("Mega Wiremill").unlimitedTierSkip).toBe(true);
  });

  it("prices parallels at the recipe's full EU: the discount lands on the calculator only", () => {
    // One LV hatch at 2 A is 64 EU/t: two 32 EU/t parallels, not three at the 0.6 discount.
    const r = recipe("Mega Wiremill", 32, "Wiremill");
    const lv = node({}, { hatchVoltageTier: "LV", hatchAmps: 2 });
    expect(getMachineParallelMultiplier(applyMachineHandlerToRecipe(r, lv), lv)).toBe(2);
  });

  it("Cracker Hub: +10% fluid per two coil tiers, items unchanged, glass 0.95^tier", () => {
    const fluid = { kind: "fluid", id: "gas", amount: 1000 } as const;
    const item = { kind: "item", id: "dust", amount: 1 } as const;
    const r = recipe("Cracker Hub", 120, "Oil Cracker", [fluid, item] as unknown as Recipe["outputs"]);
    const n = node({ heatingCoil: "tpv" });
    const effective = applyMachineHandlerToRecipe(r, n);
    expect(of("Cracker Hub").outputMultiplier!(fluid as never, ctx({ heatingCoil: 3 }))).toBeCloseTo(1.2, 12);
    expect(getMachineOutputMultiplier(effective, n, item as never, "LV")).toBe(1);
    expect(powerOf("Cracker Hub", ctx({ gtnlGlassTier: 0 }))).toBe(0.6 * Math.pow(0.95, 3)); // HV glass
  });

  it("Mega Industrial Blast Furnace: 4 << 2(tier - 2) parallels, perfect from a UEV controller", () => {
    expect(parallelsOf("Mega Industrial Blast Furnace", ctx())).toBe(8);
    expect(parallelsOf("Mega Industrial Blast Furnace", ctx({ gtnlParallelController: 1 }))).toBe(1); // 4 << -2 overflows
    expect(parallelsOf("Mega Industrial Blast Furnace", ctx({ gtnlParallelController: 3 }))).toBe(16);
    expect(of("Mega Industrial Blast Furnace").heat?.perfect?.(ctx({ gtnlParallelController: 10 }))).toBe(true);
    expect(of("Mega Industrial Blast Furnace").heat?.perfect?.(ctx({ gtnlParallelController: 9 }))).toBe(false);
    expect(speedOf("Mega Industrial Blast Furnace", ctx({ gtnlParallelController: 14 }))).toBe(Math.max(0.005, 1.0 / 5.0 - 13 / 50.0));
  });

  it("GTM family: Large Alloy Smelter subtracts controller and coil tiers from 0.8 and 1 / 1.67", () => {
    const c = ctx({ gtnlParallelController: 4, heatingCoil: 5 });
    expect(powerOf("Large Alloy Smelter", c)).toBe(0.8 - 4 / 50.0 - 5 / 50.0);
    expect(speedOf("Large Alloy Smelter", c)).toBe(1 / 1.67 - 3 / 50.0 - 5 / 50.0);
    expect(parallelsOf("Large Alloy Smelter", c)).toBe(16); // maxParallelAt(EV), no x 16
    expect(parallelsOf("Large Pyrolysis Oven", ctx())).toBe(8);
  });

  it("Chemical Plant: GT++'s on its own map, GT Not Leisure's on the LCR map", () => {
    const gtpp = ctx({ heatingCoil: 2, pipeCasing: 1 }, { recipeMap: "Chemical Plant" });
    expect(parallelsOf("Chemical Plant", gtpp)).toBe(4);
    expect(speedOf("Chemical Plant", gtpp)).toBe(1 / 1.5);
    const gtnl = ctx({ heatingCoil: 2, gtnlParallelController: 8 }, { recipeMap: "Large Chemical Reactor" });
    expect(parallelsOf("Chemical Plant", gtnl)).toBe(1024); // 4^6 capped
    expect(powerOf("Chemical Plant", gtnl)).toBe(0.8 * Math.pow(0.95, 2));
    expect(resolveOverclockSpec(of("Chemical Plant"), gtnl)).toEqual(OVERCLOCK.perfect());
  });

  it("Industrial Alloy Blast Smelter: each output doubled with a 2 x glass tier in 101 chance", () => {
    const uvGlass = ctx({ gtnlGlassTier: 5 }); // UV = tier 8
    expect(of("Industrial Alloy Blast Smelter").outputMultiplier!({ kind: "item", id: "x", amount: 1 } as never, uvGlass)).toBe(1 + 16 / 101);
    expect(resolveOverclockSpec(of("Industrial Alloy Blast Smelter"), uvGlass)).toEqual(OVERCLOCK.perfect());
  });

  it("Swelegfyr Blast Furnace: 4096 parallels (256 passive), 1 / 3.9f duration, 0.9^(excess / 900) EU", () => {
    expect(parallelsOf("Swelegfyr Blast Furnace", ctx())).toBe(4096);
    expect(parallelsOf("Swelegfyr Blast Furnace", ctx({ swelegfyrMode: 1 }))).toBe(256);
    expect(speedOf("Swelegfyr Blast Furnace", ctx())).toBe(Math.fround(1 / Math.fround(3.9)));
    // Cupronickel (1801 K) on a 900 K recipe: one 900 K step.
    expect(powerOf("Swelegfyr Blast Furnace", ctx({}, { recipeSpecialValue: 900 }))).toBe(Math.fround(0.9));
    // At its maximum, floor(1801^1.08 / 100) x 100 + 1 K.
    const max = Math.floor(Math.pow(1801, 1.08) / 100) * 100 + 1;
    expect(of("Swelegfyr Blast Furnace").heat?.machineHeat?.(1801, { swelegfyrHeat: "maximum" })).toBe(max);
    expect(of("Swelegfyr Blast Furnace").recipeGate!(ctx({}, { recipeSpecialValue: 1900, voltageTier: 2 }))).toBeDefined();
    expect(of("Swelegfyr Blast Furnace").recipeGate!(ctx({}, { recipeSpecialValue: 1900, voltageTier: 3 }))).toBeUndefined();
  });
});

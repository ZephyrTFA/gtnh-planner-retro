import { describe, expect, it } from "vitest";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { getNodePowerReport, getNodeSteamReport } from "@/lib/solver/power-report";
import { getMachineParallelMultiplier } from "@/lib/solver/machine-effects";
import { applyMachineHandlerToRecipe } from "@/lib/model/recipe-rules";
import { gtnlSteamOverclocks, gtnlSteamTicks, multiplierUnderOneTick } from "./gtnl-steam";

// Each pin names the GTNL (dev-290) or GT5-Unofficial Java it reproduces.
const recipe = (machine: string, eut: number, durationTicks: number, recipeMap = "Macerator"): Recipe =>
  ({
    id: `${machine}:${recipeMap}`,
    name: recipeMap,
    machineType: recipeMap,
    minimumTier: "ULV",
    durationTicks,
    eut,
    inputs: [],
    outputs: [],
    source: { datasetVersionId: "stable-2.9.0-gtnl", recipeMap, exporter: "test" },
    machineHandlers: [{ id: "steam", label: machine, machineType: machine, minimumTier: "ULV", kind: "multiblock" }],
  }) as unknown as Recipe;
const node = (settings: Record<string, string> = {}): FactoryNode => ({
  id: "n",
  recipeId: "r",
  overclockTier: "ULV",
  machineCount: 1,
  parallel: 1,
  enabled: true,
  position: { x: 0, y: 0 },
  machineHandlerId: "steam",
  machineConfigTiers: settings,
});
const steel = { steamPressure: "high" };

describe("GT Not Leisure steam multiblocks", () => {
  it("Large Steam Crusher: 128 or 256 parallels, duration / 10 / tierMachine, EU x 0.8 x tierMachine", () => {
    const r = recipe("Large Steam Crusher", 2, 300);
    // 300 x (1.0 / 1 / 10.0 / 1) = 30.000000000000004, truncated to 30.
    expect(getOverclockedRecipeStats(r, node()).durationTicks).toBe(30);
    expect(getMachineParallelMultiplier(applyMachineHandlerToRecipe(r, node()), node())).toBe(128);
    // onRunningTick: ceil(2 EU x 128 x 0.8) L a tick.
    expect(getNodeSteamReport(r, node())?.drawSteamPerTick).toBe(205);
    expect(getOverclockedRecipeStats(r, node(steel)).durationTicks).toBe(15);
    expect(getMachineParallelMultiplier(applyMachineHandlerToRecipe(r, node(steel)), node(steel))).toBe(256);
  });

  it("the overclocking count halves the duration and quadruples the EU a step, banking sub-tick runs", () => {
    const r = recipe("Large Steam Crusher", 2, 300);
    const maxed = node({ ...steel, gtnlSteamOverclocks: "4" });
    // 300 / 16 / 10 / 2 = 0.9375 ticks: multiplierUnderOneTick doubles the
    // 256 parallels, so 512 runs a tick, read as half a tick per 256.
    expect(getOverclockedRecipeStats(r, maxed).durationTicks).toBe(0.5);
    // Steam bills min(parallels, runs) = 256: ceil(2 x 256 x 4^4 x 0.8 x 2).
    expect(getNodeSteamReport(r, maxed)?.drawSteamPerTick).toBe(209716);
  });

  it("refuses a recipe over V[getTierRecipes()], MV bronze and HV steel on the crusher", () => {
    expect(getNodePowerReport(recipe("Large Steam Crusher", 128, 300), node()).state).toBe("ok");
    const over = getNodePowerReport(recipe("Large Steam Crusher", 129, 300), node());
    expect(over.state).toBe("over-tier");
    expect(over.recipeGateReason).toBe("This steam build runs recipes up to MV.");
    expect(getNodePowerReport(recipe("Large Steam Crusher", 129, 300), node(steel)).state).toBe("ok");
    expect(getNodeSteamReport(recipe("Large Steam Crusher", 129, 300), node())?.gate).toBeDefined();
  });

  it("GT's own steam multiblocks refuse anything over LV (getTierRecipes() is 1)", () => {
    expect(getNodePowerReport(recipe("Steam Grinder", 32, 300), node()).state).toBe("ok");
    expect(getNodePowerReport(recipe("Steam Grinder", 33, 300), node(steel)).state).toBe("over-tier");
    // The litres are unchanged: recipe EU x 1.25 x tierMachine x 8 parallels.
    expect(getNodeSteamReport(recipe("Steam Grinder", 2, 300), node(steel))?.drawSteamPerTick).toBe(40);
  });

  it("Large Steam Furnace: 64 ticks over 2^oc and VP[getTier(4 x parallels)] x 4^oc for the machine", () => {
    const smelt = recipe("Large Steam Furnace", 0, 200, "Furnace");
    expect(getOverclockedRecipeStats(smelt, node()).durationTicks).toBe(64);
    expect(getNodeSteamReport(smelt, node())?.drawSteamPerTick).toBe(480); // VP[HV]
    const fast = node({ ...steel, gtnlSteamOverclocks: "2" });
    expect(getOverclockedRecipeStats(smelt, fast).durationTicks).toBe(16);
    expect(getNodeSteamReport(smelt, fast)?.drawSteamPerTick).toBe(1920 * 16); // VP[EV] x 4^2
    expect(getMachineParallelMultiplier(applyMachineHandlerToRecipe(smelt, fast), fast)).toBe(256);
  });

  it("Steam Supercompressor: still overclocks at EV on top of the player's count", () => {
    // 30 EU/t, 256 parallels at V[4]: three steps (2048 / 32 = 64, and EV is
    // three voltage tiers above LV), so 400 ticks run in 50.
    expect(gtnlSteamOverclocks(2048, 30, 1, 256)).toBe(3);
    const r = recipe("Steam Supercompressor", 30, 400, "Compressor");
    expect(getOverclockedRecipeStats(r, node()).durationTicks).toBe(50);
    expect(getNodeSteamReport(r, node())?.drawSteamPerTick).toBe(30 * 256 * 64);
    // One player overclock costs a step: 4^1 x 30 x 4^2 still fits in 2048, 4^3 does not.
    expect(getOverclockedRecipeStats(r, node({ gtnlSteamOverclocks: "1" })).durationTicks).toBe(50);
  });

  it("Large Steam Mixer: a Stainless Steel Gear raises the steel build to 32 parallels and HV", () => {
    const gear = { ...steel, gtnlControllerItem: "stainless-steel-gear" };
    const r = recipe("Large Steam Mixer", 512, 100, "Mixer");
    expect(getNodePowerReport(r, node(steel)).state).toBe("over-tier");
    expect(getNodePowerReport(r, node(gear)).state).toBe("ok");
    expect(getMachineParallelMultiplier(applyMachineHandlerToRecipe(r, node(gear)), node(gear))).toBe(32);
    // (1 / 0.67 / 2 - 0.25) x 100 = 49.6..., truncated.
    expect(getOverclockedRecipeStats(r, node(gear)).durationTicks).toBe(49);
  });

  it("Steam Manufacturer takes assembler recipes up to MV, or HV with an HV Assembler in the controller", () => {
    const hv = recipe("Steam Manufacturer", 480, 100, "Assembler");
    expect(getNodePowerReport(hv, node()).state).toBe("over-tier");
    expect(getNodePowerReport(hv, node({ gtnlControllerItem: "hv-assembler" })).state).toBe("ok");
  });

  it("calculateMultiplierUnderOneTick with no overclocks counts the negative gaps as extra steps", () => {
    expect(multiplierUnderOneTick(0.3, 0)).toBe(7);
    expect(multiplierUnderOneTick(0.5, 0)).toBe(4);
    expect(multiplierUnderOneTick(1, 0)).toBe(1);
    expect(multiplierUnderOneTick(3, 0)).toBe(1);
    // The parallel helper caps the runs at V x parallels / recipe EU/t.
    expect(gtnlSteamTicks(0.3, { parallels: 16, voltage: 128, recipeEuT: 100 })).toBe(16 / 20);
  });
});

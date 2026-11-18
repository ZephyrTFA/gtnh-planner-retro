import { describe, expect, it } from "vitest";
import {
  FUSION_MACHINES,
  fusionParallels,
  getFusionMachine,
  getFusionRecipeMark,
  getFusionStartupEu,
  getFusionStats,
} from "./fusion";
import type { FactoryNode, FactoryProject, Recipe } from "@/lib/model/types";
import { applyMachineHandlerToRecipe, getRecipeMachineHandlers } from "@/lib/model/recipe-rules";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { getNodePowerReport } from "@/lib/solver/power-report";
import { getMachineParallelMultiplier } from "@/lib/solver/machine-effects";
import { selectRuntimeCalculationVariant } from "@/lib/solver/runtime-calculation";
import { getHandlerRecipeStats } from "@/components/flow/MachinePicker";
import { calculateThroughput } from "@/lib/solver/throughput";
import { getSharedMachineHandlers } from "@/lib/model/shared-machine";
import { normalizeLoadedProject } from "@/lib/model/project-normalize";

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
/**
 * The names the game gives its ten reactors (GT5U `fusioncomputer.tier.06..08`,
 * GT++ `MTEAdvFusionMk4/5`, GoodGenerator `largefusioncomputer1..5`), which are
 * what the exported recipe handlers carry. A reactor whose name the table does
 * not have keeps its hatches and silently runs ordinary voltage overclocks, so
 * these strings are pinned here rather than read back from FUSION_MACHINES.
 */
const EXPORTED_CONTROLLERS: ReadonlyArray<readonly [name: string, mark: number, compact: boolean]> = [
  ["Fusion Control Computer Mk-I", 1, false],
  ["Fusion Control Computer Mk-II", 2, false],
  ["Fusion Control Computer Mk-III", 3, false],
  ["FusionTech Mk-IV", 4, false],
  ["FusionTech Mk-V", 5, false],
  ["Compact Fusion Computer Mk-I", 1, true],
  ["Compact Fusion Computer Mk-II", 2, true],
  ["Compact Fusion Computer Mk-III", 3, true],
  ["Compact Fusion Computer Mk-IV", 4, true],
  ["Compact Fusion Computer Mk-V", 5, true],
];
const helium: Recipe = {
  id: "helium",
  name: "Fusion Reactor: Helium Plasma",
  machineType: "Fusion Reactor",
  minimumTier: "EV",
  durationTicks: 16,
  eut: 1920,
  inputs: [
    { kind: "fluid", id: "deuterium", amount: 125 },
    { kind: "fluid", id: "helium-3", amount: 125 },
  ],
  outputs: [{ kind: "fluid", id: "plasma.helium", amount: 125 }],
  metadata: { fusionStartupEu: 60_000_000 },
  machineHandlers: FUSION_MACHINES.map((m) => ({
    id: slug(m.name),
    label: m.name,
    machineType: m.name,
    kind: m.compact ? "single" : "multiblock",
    minimumTier: "EV",
  })),
  runtimeCalculation: {
    status: "computed",
    oracleEligible: true,
    sourceKind: "gregtech-overclock-calculator",
    variants: [
      { id: "bad", label: "EV", overclockTier: "EV", durationTicks: 1, eut: 999999, parallel: 1 },
    ],
  },
};
const node = (i: number): FactoryNode => ({
  id: "fusion",
  recipeId: "helium",
  machineHandlerId: slug(FUSION_MACHINES[i].name),
  overclockTier: "EV",
  machineCount: 1,
  parallel: 1,
  enabled: true,
  position: { x: 0, y: 0 },
});

describe("fusion reactor rules from GT5U and the 2.9 workbook", () => {
  it.each([
    [0, 156.25, 1920, 1, 0],
    [1, 312.5, 3840, 1, 1],
    [2, 625, 7680, 1, 2],
    [3, 10000, 122880, 1, 3],
    [4, 40000, 491520, 1, 4],
    [5, 10000, 122880, 64, 0],
    [6, 40000, 491520, 128, 1],
    [7, 120000, 1474560, 192, 2],
    [8, 2560000, 31457280, 256, 3],
    [9, 12800000, 157286400, 320, 4],
  ])("helium on controller %i: %s L/s, %s EU/t", (i, output, draw, parallels, steps) => {
    const n = node(i);
    const applied = applyMachineHandlerToRecipe(helium, n);
    const stats = getOverclockedRecipeStats(helium, n);
    expect(applied.machineProfile?.kind).toBe("multiblock");
    expect(getMachineParallelMultiplier(applied, n)).toBe(parallels);
    expect((125 * 20 * parallels) / stats.durationTicks).toBe(output);
    expect(getNodePowerReport(helium, n)).toMatchObject({
      state: "ok",
      drawEuT: draw,
      parallels,
      overclockSteps: steps,
      perfectOverclockSteps: steps,
    });
    expect(selectRuntimeCalculationVariant(applied, n)).toBeUndefined();
    expect(
      getHandlerRecipeStats(
        helium,
        getRecipeMachineHandlers(helium).find((h) => h.id === n.machineHandlerId)!,
      ),
    ).toMatchObject({ eut: draw });
    expect(
      getOverclockedRecipeStats(helium, {
        ...n,
        overclockTier: "MAX",
        hatchVoltageTier: "ULV",
        hatchAmps: 0,
        powerEuT: 0,
      }),
    ).toEqual(stats);
    expect(
      getNodePowerReport(helium, { ...n, hatchVoltageTier: "ULV", hatchAmps: 0, powerEuT: 0 })
        .drawEuT,
    ).toBe(draw);
  });

  it("is keyed by the controller names the dataset's handlers carry", () => {
    expect(FUSION_MACHINES.map((m) => m.name)).toEqual(EXPORTED_CONTROLLERS.map(([name]) => name));
    for (const [name, mark, compact] of EXPORTED_CONTROLLERS) {
      expect(getFusionMachine(name)).toMatchObject({ name, mark, compact });
    }
  });

  it("runs an exported recipe card by reactor mark, not by hatch voltage", () => {
    // Handlers exactly as the oracle exports them, so the reactor lookup is
    // tested against the game's names instead of this file's own table.
    const exported: Recipe = {
      ...helium,
      machineHandlers: EXPORTED_CONTROLLERS.map(([name]) => ({
        id: slug(name),
        label: name,
        machineType: name,
        kind: "multiblock",
        minimumTier: "EV",
      })),
    };
    // OverclockTier and hatches that would buy steps on a voltage ladder.
    const hot = (i: number) => ({
      ...node(i),
      overclockTier: "MAX" as const,
      hatchVoltageTier: "UEV" as const,
      hatchAmps: 32,
    });
    // Helium is a Mk-I recipe: its own reactor buys nothing, a Mk-III two
    // steps and a Mk-V four, all from the mark.
    expect(getOverclockedRecipeStats(exported, hot(0))).toMatchObject({
      tier: "LuV",
      overclockSteps: 0,
      eut: 1920,
      durationTicks: 16,
    });
    expect(getOverclockedRecipeStats(exported, hot(2))).toMatchObject({
      tier: "UV",
      overclockSteps: 2,
      eut: 7680,
      durationTicks: 4,
    });
    expect(getOverclockedRecipeStats(exported, hot(4))).toMatchObject({
      tier: "UEV",
      overclockSteps: 4,
      eut: 491520,
    });
    expect(getFusionStats(applyMachineHandlerToRecipe(exported, hot(0)))?.parallels).toBe(1);
    expect(getFusionStats(applyMachineHandlerToRecipe(exported, hot(9)))?.parallels).toBe(320);
  });

  it("offers only reactor marks that can run the recipe, including voltage gates", () => {
    const recipe = { ...helium, metadata: { fusionStartupEu: 750_000_000 } };
    const handlers = getRecipeMachineHandlers(recipe);
    expect(handlers.map((h) => h.label)).toEqual(
      FUSION_MACHINES.filter((m) => m.mark >= 4).map((m) => m.name),
    );
    expect(applyMachineHandlerToRecipe(recipe, node(0)).machineType).toBe("FusionTech Mk-IV");
    expect(getFusionRecipeMark({ ...recipe, eut: 7_864_320 })).toBe(5);
  });

  it("distinguishes inclusive startup tiering from strict compact parallel thresholds", () => {
    for (const [mark, limit] of [
      [1, 160e6],
      [2, 320e6],
      [3, 640e6],
      [4, 5120e6],
    ]) {
      expect(getFusionRecipeMark({ ...helium, metadata: { fusionStartupEu: limit } })).toBe(mark);
      expect(getFusionRecipeMark({ ...helium, metadata: { fusionStartupEu: limit + 1 } })).toBe(
        mark + 1,
      );
      expect(fusionParallels(5, true, limit - 1) - fusionParallels(5, true, limit)).toBe(64);
    }
  });

  it("repairs old metadata by exact recipe shape, never by output name", () => {
    expect(getFusionStartupEu({ ...helium, metadata: undefined })).toBe(60_000_000);
    expect(
      getFusionStartupEu({ ...helium, metadata: undefined, durationTicks: 999 }),
    ).toBeUndefined();
    expect(getFusionStartupEu({ ...helium, metadata: { fusionStartupEu: 42 } })).toBe(42);
  });

  it("does not treat unrelated fusion crafting or power cards as fusion reactors", () => {
    expect(
      getFusionRecipeMark({ machineType: "Draconic Evolution Fusion Crafter" }),
    ).toBeUndefined();
    const power = { ...helium, power: { sourceId: "fusion-reactor", euPerTick: -1920, stats: [] } };
    expect(getOverclockedRecipeStats(power, node(4)).eut).toBe(1920);
  });

  it("keeps compact production and consumption through the real solver and saved-plan load", () => {
    const n = node(9);
    const project: FactoryProject = {
      schemaVersion: 1,
      id: "test",
      name: "Fusion",
      recipes: [helium],
      nodes: [n],
      fuelProfiles: [],
      storages: [...helium.inputs, ...helium.outputs].map((r) => ({
        id: r.id,
        kind: r.kind,
        resourceId: r.id,
        position: { x: 0, y: 0 },
      })),
      edges: [
        ...helium.inputs.map((r) => ({
          id: r.id,
          source: r.id,
          target: n.id,
          resourceKind: r.kind,
          resourceId: r.id,
        })),
        {
          id: "ship",
          source: n.id,
          target: helium.outputs[0].id,
          resourceKind: "fluid",
          resourceId: helium.outputs[0].id,
        },
      ],
    };
    const loaded = normalizeLoadedProject(JSON.parse(JSON.stringify(project)));
    const result = calculateThroughput(loaded);
    expect(result.nodes.fusion.euT).toBe(157286400);
    expect(result.nodes.fusion.outputs["fluid:plasma.helium"].amountPerSecond).toBe(12800000);
    expect(result.nodes.fusion.powerStalled).toBe(false);
    expect(result.edges.ship.transferredPerSecond / 12800000).toBeCloseTo(1, 6);
    expect(result.nodes.fusion.warnings.join(" ")).not.toContain("runtime calculation");
  });

  it("intersects shared fusion sections by their real controller eligibility", () => {
    const high = { ...helium, id: "high", metadata: { fusionStartupEu: 6e9 } };
    const shared = { ...node(9), extraRecipes: [{ recipeId: "high" }] };
    expect(
      getSharedMachineHandlers(
        shared,
        new Map([
          [helium.id, helium],
          [high.id, high],
        ]),
      ).map((h) => h.label),
    ).toEqual(["FusionTech Mk-V", "Compact Fusion Computer Mk-V"]);
  });
});

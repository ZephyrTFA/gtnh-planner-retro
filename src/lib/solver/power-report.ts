import { msg, t, td, tPlural } from "@/lib/i18n";
import { maxInputTierSkips } from "./power-input-rules";
import { getFusionStats } from "@/lib/machines/fusion";
import {
  applyMachineHandlerToRecipe,
  getSelectedMachineHandler,
  GT_FURNACE_RECIPE_EUT,
  isHighPressureSteamHandler,
  isSmeltingRecipeMap,
  isSteamMachineHandler,
} from "@/lib/model/recipe-rules";
import { getEnergyHatchType } from "@/lib/machines/energy-hatches";
import { getMachineBehaviour, resolveCoefficient, STEAM_PRESSURE, type RecipeGateMessage } from "@/lib/machines/machine-table";
import {
  getRecipeMinimumVoltageTier,
  getVoltageTierForEuT,
  getVoltageTierIndex,
  getVoltageTierMaxEuT,
  resolveVoltageTier,
} from "@/lib/model/tiers";
import type { FactoryNode, MachineTier, Recipe } from "@/lib/model/types";
import { getHeatDiscountMultiplier } from "./heat";
import {
  buildMachineContext,
  getMachineEutMultiplier,
  getMachineParallelMultiplier,
} from "./machine-effects";
import { getOverclockedRecipeStats } from "./overclock";
import {
  getEffectiveVoltageOrdinal,
  getNodeEnergyHatches,
  getNodePowerAmps,
  getNodePowerBudget,
  getNodeRunTier,
  isMultiblockRecipe,
} from "./power";
import { getCropsNhStats, isIndustrialApiaryMachineType } from "@/lib/model/passive-production";
import { selectRuntimeCalculationVariant } from "./runtime-calculation";

type VoltageTier = Exclude<MachineTier, "DEMO">;
type PowerReportNode = Pick<
  FactoryNode,
  "overclockTier" | "coilTier" | "machineHandlerId" | "machineConfigTiers"
> &
  Partial<
    Pick<
      FactoryNode,
      "energyHatches" | "energyHatchType" | "powerEuT" | "hatchVoltageTier" | "hatchAmps" | "powerInputMode"
    >
  >;

/**
 * Whether the build can start at all, straight from the game's checks. There
 * is no slow mode in GT: a machine either runs what the report says or sits
 * idle, so these are the only three states.
 */
export type NodePowerState = "ok" | "under-powered" | "over-tier";

export interface NodePowerReport {
  state: NodePowerState;
  /** Machine-specific structural limit, such as the HILE's laser source tier. In English. */
  recipeGateReason?: string;
  /** The msg() key and values `recipeGateReason` was filled from, for `describePowerStall`. */
  recipeGateMessage?: { key: string; vars: Record<string, string | number> };
  /** The tier the user picked (or the recipe's minimum by default). */
  tier: VoltageTier;
  minimumTier: VoltageTier;
  /** Hatch count on a multiblock; 1 and meaningless on a singleblock. */
  hatches: number;
  /** The exotic hatch family's item name; undefined on plain energy hatches. */
  hatchTypeLabel?: string;
  /** Its short amp badge ("256A"), worn where the hatch count would sit. */
  hatchChip?: string;
  /**
   * A supply expressed as working amps (or a legacy EU/t budget). The
   * legacy hatch-count fields do not describe this build.
   */
  typedBudget: boolean;
  isMultiblock: boolean;
  /** Working amps: hatch amps on a multiblock, machine amperage otherwise. */
  amps: number;
  /** Total EU/t the build can drink: tier voltage x amps. */
  poolEuT: number;
  /** One parallel's modified draw, what ParallelHelper checks the pool against. */
  singleDrawEuT: number;
  /** Parallels actually running (structure capped by the pool). */
  parallels: number;
  /** The machine's draw while running: overclocked EU/t x parallels. */
  drawEuT: number;
  overclockSteps: number;
  /** Of which perfect (machine/heat) steps, taken first. See overclock.ts. */
  perfectOverclockSteps: number;
  /** A perfect step's duration divisor and EU/t multiplier. */
  perfectSpeedFactor: number;
  perfectEuFactor: number;
  /** drawEuT / poolEuT, for the usage figure. 0 when the pool is unbounded. */
  usage: number;
}

/**
 * Recipes whose card has no meaningful power section: nothing electric moves
 * through crops, bees, or zero-EU manual work.
 */
export function hasPowerReport(recipe: Recipe): boolean {
  if (!(Math.abs(recipe.eut) > 0) || recipe.durationTicks <= 0) {
    return false;
  }
  if (getCropsNhStats(recipe) || isIndustrialApiaryMachineType(recipe.machineType)) {
    return false;
  }
  return true;
}

/**
 * Whether the CARD has a power section, judged on the machine the card
 * actually runs. A handler may supply EU the recipe never states (the Multi
 * Smelter's fixed 4 EU/t furnace recipe), and a multiblock card with no power
 * section keeps the plain tier dial: that writes `overclockTier` while the
 * solver runs the hatches, so the voltage the player picks changes only the
 * label.
 */
export function hasCardPowerReport(
  recipe: Recipe,
  node: Parameters<typeof applyMachineHandlerToRecipe>[1],
): boolean {
  return hasPowerReport(recipe.machineType ? applyMachineHandlerToRecipe(recipe, node) : recipe);
}

/** A gate's English text, values filled in; td() translates it from its message. */
function gateText(gate: string | RecipeGateMessage | undefined): string | undefined {
  if (gate === undefined || typeof gate === "string") return gate;
  return Object.entries(gate.vars).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    gate.key,
  );
}

export function getNodePowerReport(recipe: Recipe, node: PowerReportNode): NodePowerReport {
  const effectiveRecipe = recipe.machineType ? applyMachineHandlerToRecipe(recipe, node) : recipe;
  const minimumTier = getRecipeMinimumVoltageTier(effectiveRecipe);
  const tier = getNodeRunTier(effectiveRecipe, node);
  const isMultiblock = isMultiblockRecipe(effectiveRecipe);
  const hatches = getNodeEnergyHatches(effectiveRecipe, node);
  const hatchType = getEnergyHatchType(node.energyHatchType);
  const typedBudget = getNodePowerBudget(effectiveRecipe, node) !== undefined;
  const amps = getNodePowerAmps(effectiveRecipe, node);
  const poolEuT = getVoltageTierMaxEuT(tier) * amps;

  const rawEuT = Math.abs(effectiveRecipe.eut);
  const eutMultiplier = getMachineEutMultiplier(effectiveRecipe, node);
  const heatDiscount = getHeatDiscountMultiplier(
    effectiveRecipe,
    node,
    tier,
    getEffectiveVoltageOrdinal(effectiveRecipe, node, tier),
  );
  const singleDrawEuT = Math.ceil(rawEuT * eutMultiplier * heatDiscount);

  const stats = getOverclockedRecipeStats(recipe, node);
  const runtimeVariant = selectRuntimeCalculationVariant(effectiveRecipe, node);
  const parallels = runtimeVariant?.parallel ?? getMachineParallelMultiplier(effectiveRecipe, node);
  const drawEuT = Math.abs(stats.eut) * parallels;
  const behaviour = getMachineBehaviour(effectiveRecipe.machineType);
  const voltageLimit = behaviour?.inputVoltageTierLimit?.(node.machineConfigTiers ?? {});
  const casingGateReason = voltageLimit !== undefined && getVoltageTierIndex(getVoltageTierForEuT(rawEuT)) > voltageLimit
    ? msg("Machine casing voltage is too low for this recipe. Select a higher machine casing; UHV casings remove the limit.")
    : undefined;
  const fusion = getFusionStats(effectiveRecipe);
  // The report can be built in a worker and is shown later, so it carries
  // English and describePowerStall translates it.
  const fusionMarkKey = msg("This recipe requires a Mk-{mark} fusion reactor or higher.");
  const fusionGateMessage = fusion && !fusion.eligible && fusion.recipeMark !== undefined
    ? { key: fusionMarkKey, vars: { mark: fusion.recipeMark } }
    : undefined;
  const fusionGateReason = fusion && !fusion.eligible
    ? fusion.recipeMark === undefined ? msg("Fusion startup metadata is unavailable for this recipe.")
      : fusionMarkKey.replace("{mark}", String(fusion.recipeMark))
    : undefined;
  const machineGate = fusionGateReason ? undefined : behaviour?.recipeGate?.(buildMachineContext(effectiveRecipe, node));
  const machineGateMessage = typeof machineGate === "object" ? machineGate : undefined;
  const recipeGateReason = fusionGateReason ?? gateText(machineGate) ?? casingGateReason;
  const recipeGateMessage = fusionGateMessage ?? machineGateMessage;

  return {
    state: recipeGateReason ? "over-tier" : getPowerState(effectiveRecipe, tier, minimumTier, isMultiblock, poolEuT, singleDrawEuT),
    recipeGateReason,
    ...(recipeGateMessage ? { recipeGateMessage } : {}),
    tier,
    minimumTier,
    hatches,
    hatchTypeLabel: isMultiblock && !typedBudget && hatchType.exotic ? hatchType.label : undefined,
    hatchChip: isMultiblock && !typedBudget && hatchType.exotic ? hatchType.chip : undefined,
    typedBudget,
    isMultiblock,
    amps,
    poolEuT,
    singleDrawEuT,
    parallels,
    drawEuT,
    overclockSteps: stats.overclockSteps,
    perfectOverclockSteps: stats.perfectOverclockSteps,
    perfectSpeedFactor: stats.perfectSpeedFactor,
    perfectEuFactor: stats.perfectEuFactor,
    usage: Number.isFinite(poolEuT) && poolEuT > 0 ? drawEuT / poolEuT : 0,
  };
}

function getPowerState(
  effectiveRecipe: Recipe,
  tier: VoltageTier,
  minimumTier: VoltageTier,
  isMultiblock: boolean,
  poolEuT: number,
  singleDrawEuT: number,
): NodePowerState {
  const rawEuT = Math.abs(effectiveRecipe.eut);
  if (!(rawEuT > 0) || !Number.isFinite(poolEuT)) {
    return "ok";
  }

  // A structural minimum above the recipe's own power draw (an assembly line
  // gated to a tier, a casing requirement) cannot be bought with amps.
  const powerTier = getVoltageTierForEuT(rawEuT);
  const declaredMinimum = resolveVoltageTier(effectiveRecipe.minimumTier, powerTier);
  if (
    getVoltageTierIndex(declaredMinimum) > getVoltageTierIndex(powerTier) &&
    getVoltageTierIndex(tier) < getVoltageTierIndex(declaredMinimum)
  ) {
    return "over-tier";
  }

  if (isMultiblock) {
    // No supply at all (a typed zero) is underpowered before it is anything
    // else: the tier-skip rule below would read 0 as ULV hatches.
    if (poolEuT <= 0 && singleDrawEuT > 0) {
      return "under-powered";
    }
    // `OverclockCalculator.getAllowedTierSkip`: a recipe more than one tier
    // above the hatch voltage never runs, however many amps are stacked.
    if (rawEuT > getVoltageTierMaxEuT(tier) * 4 ** maxInputTierSkips(effectiveRecipe.machineType)) {
      return "over-tier";
    }
    // `ParallelHelper.determineParallel`: the pool must carry one whole
    // parallel of the modified draw or the machine reports insufficient power.
    if (singleDrawEuT > poolEuT) {
      return "under-powered";
    }
    return "ok";
  }

  // A singleblock has no hatches to add: a recipe over its machine's power
  // simply belongs to a higher-tier machine.
  if (singleDrawEuT > poolEuT) {
    return "over-tier";
  }
  return "ok";
}

export interface NodeSteamReport {
  /** L/t one machine burns at full speed, parallels included. */
  drawSteamPerTick: number;
  /** One parallel's L/t. */
  singleDrawSteamPerTick: number;
  parallels: number;
  isMultiblock: boolean;
  highPressure: boolean;
  /** Why this build refuses the recipe (its voltage cap); the solver stalls it. */
  gate?: string | RecipeGateMessage;
}

/**
 * What a steam machine burns. Steam never reaches the EU model (the handler
 * zeroes eut so no phantom power is billed); the litres follow each machine's
 * own rule, from the GT5-Unofficial source:
 *
 * - A singleblock converts 2 L per EU: a bronze machine runs the recipe's EU
 *   as written at twice the duration, a high pressure one at twice the EU and
 *   the recipe's own duration (SteamOverclockDescriber, (1,2) and (2,1)).
 * - A steam multiblock consumes 1 L per EU of its calculated draw
 *   (MTESteamMultiBlockBase.onRunningTick at full efficiency): recipe EU x the
 *   table's `power` per parallel (GT's: 1.25 x tierMachine, tierMachine 2 on a
 *   high pressure build), or the entry's own `steamPerTick`. Runs banked below
 *   one tick are free: OverclockCalculator.setCurrentParallel bills
 *   min(parallels, runs).
 *
 * Smelting bills GT's fixed 4 EU/t furnace recipe; the dataset's vanilla map
 * says 0 EU (see GT_FURNACE_RECIPE_EUT).
 */
export function getNodeSteamReport(
  recipe: Recipe,
  node: PowerReportNode,
): NodeSteamReport | undefined {
  if (!recipe.machineType) {
    return undefined;
  }
  const handler = getSelectedMachineHandler(recipe, node);
  if (!isSteamMachineHandler(handler)) {
    return undefined;
  }
  const baseEut =
    Math.abs(recipe.eut) > 0
      ? Math.abs(recipe.eut)
      : isSmeltingRecipeMap(recipe)
        ? GT_FURNACE_RECIPE_EUT
        : 0;
  if (!(baseEut > 0) || recipe.durationTicks <= 0) {
    return undefined;
  }

  const effectiveRecipe = applyMachineHandlerToRecipe(recipe, node);
  if (effectiveRecipe.machineProfile?.kind === "multiblock") {
    const ctx = buildMachineContext(effectiveRecipe, node);
    const behaviour = getMachineBehaviour(effectiveRecipe.machineType);
    const pressureTier = ctx.tier(STEAM_PRESSURE) + 1;
    const parallels = getMachineParallelMultiplier(effectiveRecipe, node);
    const fixed = behaviour?.steamPerTick?.(ctx);
    const single = fixed !== undefined
      ? fixed / parallels
      : baseEut * resolveCoefficient(behaviour?.power, ctx, 1.25 * pressureTier);
    const gate = behaviour?.recipeGate?.(ctx);
    return {
      drawSteamPerTick: fixed ?? Math.ceil(single * parallels),
      singleDrawSteamPerTick: single,
      parallels,
      isMultiblock: true,
      highPressure: pressureTier === 2,
      ...(gate === undefined ? {} : { gate }),
    };
  }

  const highPressure = isHighPressureSteamHandler(handler);
  const single = baseEut * (highPressure ? 2 : 1) * 2;
  return {
    drawSteamPerTick: Math.ceil(single),
    singleDrawSteamPerTick: single,
    parallels: 1,
    isMultiblock: false,
    highPressure,
  };
}

/** A steam build's refusal in the interface language, if it refuses the recipe. */
export function describeSteamGate(report: NodeSteamReport): string | undefined {
  const gate = report.gate;
  if (gate === undefined) return undefined;
  return typeof gate === "string" ? td(gate) : td(gate.key, gate.vars);
}

/** True when the report says the machine cannot start at all. */
export function isPowerStalled(report: NodePowerReport): boolean {
  return report.state !== "ok";
}

/** One-line reason for a stalled build, used by node warnings, in the interface language. */
export function describePowerStall(report: NodePowerReport): string | undefined {
  if (report.recipeGateReason) {
    // Gate reasons are English (msg()-marked where they are written).
    return report.recipeGateMessage
      ? td(report.recipeGateMessage.key, report.recipeGateMessage.vars)
      : td(report.recipeGateReason);
  }
  if (report.state === "under-powered") {
    if (report.typedBudget) {
      return t("Needs {draw} EU/t. Supplied {supply}.", {
        draw: report.singleDrawEuT,
        supply: formatBudget(report.poolEuT),
      });
    }
    const vars = {
      draw: report.singleDrawEuT,
      tier: report.tier,
      supply: report.poolEuT,
      count: report.hatches,
      hatch: report.hatchTypeLabel ?? "",
    };
    return report.hatchTypeLabel
      ? t("Underpowered: the recipe draws {draw} EU/t but the {tier} {hatch} supplies {supply} EU/t. Add amperage or raise the tier.", vars)
      : tPlural(
          report.hatches,
          "Underpowered: the recipe draws {draw} EU/t but {count}x {tier} hatch supplies {supply} EU/t. Add amperage or raise the tier.",
          "Underpowered: the recipe draws {draw} EU/t but {count}x {tier} hatches supply {supply} EU/t. Add amperage or raise the tier.",
          vars,
        );
  }
  if (report.state === "over-tier") {
    const vars = { tier: report.tier, minimum: report.minimumTier };
    return report.isMultiblock
      ? t("Won't run at {tier}: this recipe needs at least {minimum} hatches (amps cannot skip more than one tier).", vars)
      : t("Won't run at {tier}: this recipe needs at least {minimum}.", vars);
  }
  return undefined;
}

function formatBudget(euT: number): string {
  return Number.isInteger(euT) ? String(euT) : euT.toFixed(1);
}

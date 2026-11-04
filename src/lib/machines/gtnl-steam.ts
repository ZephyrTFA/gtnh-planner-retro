/**
 * GT Not Leisure's steam multiblocks (addon sets "gtnl" and "tst-gtnl"), from
 * SteamMultiMachineBase and its subclasses in com.science.gtnl.common.machine
 * (the dev-290 build the sets pin; its sources sit beside the mirrored jar).
 *
 * The base runs GTNLProcessingLogic with no overclocks: duration x
 * getDurationModifier(), EU x getEUtDiscount(), getMaxParallelRecipes()
 * parallels, and GT++'s setProcessingLogicPower: V[getTierRecipes()] at one amp
 * a parallel, no tier skips. The player's "Overclocking count" (recipeOcCount,
 * 0 to 4) halves the duration and quadruples the EU per step. Steam is 1 L per
 * EU of the calculated draw (onRunningTick at full efficiency).
 */

/** GTValues.V, ULV to MAX. */
export const GT_V = [
  8, 32, 128, 512, 2048, 8192, 32_768, 131_072, 524_288, 2_097_152, 8_388_608, 33_554_432, 134_217_728,
  536_870_912, 2_147_483_640,
];

/** Tier names by V index. */
export const GT_TIER_NAMES = ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UMV", "UXV", "MAX"];

/** GTValues.VP: V x 30 / 32, the voltage a recipe uses to fill one amp. */
export const GT_VP = GT_V.map((v) => Math.floor((v * 30) / 32));

/** GTUtility.getTier(long): the tier whose voltage covers `euT`. */
export function gtTier(euT: number): number {
  if (euT > GT_V[14]) return 15;
  if (euT <= GT_V[0]) return 0;
  return Math.floor((Math.ceil(Math.log2(euT)) - 2) / 2);
}

/** recipeOcCount clamped as clampRecipeOcCount does, from the knob's value. */
export function gtnlSteamOcCount(value: number): number {
  return Math.max(0, Math.min(4, Math.floor(value)));
}

/** The base getEUtDiscount(): (1 << (2 * oc)). */
export function gtnlSteamBaseEuDiscount(oc: number): number {
  return 4 ** oc;
}

/** The base getDurationModifier(): 1.0 / (1 << oc). */
export function gtnlSteamBaseDurationModifier(oc: number): number {
  return 1.0 / 2 ** oc;
}

/**
 * OverclockCalculator.calculateMultiplierUnderOneTick with no heat overclocks:
 * the parallel multiplier for a duration the overclocks push under one tick.
 * With zero overclocks the "needed" counts go negative and still count as
 * extra steps, so a 0.3-tick recipe runs ceil(2 / 0.3) = 7 times a tick, not 3.
 */
export function multiplierUnderOneTick(duration: number, overclocks: number): number {
  const neededHeatOverclocks = Math.ceil(Math.log(duration) / Math.log(4));
  const neededRegularOverclocks = Math.ceil(Math.log(duration) / Math.log(2));
  const heatMultiplier = 4 ** Math.max(0 - neededHeatOverclocks, 0);
  const regularMultiplier = 2 ** Math.max(overclocks - neededRegularOverclocks, 0);
  let correctionMultiplier: number;
  if (0 >= neededHeatOverclocks) {
    correctionMultiplier = 4 ** neededHeatOverclocks / duration;
  } else if (overclocks >= neededRegularOverclocks) {
    correctionMultiplier = 2 ** neededRegularOverclocks / duration;
  } else {
    return 1;
  }
  return Math.ceil(heatMultiplier * regularMultiplier * correctionMultiplier);
}

/**
 * The ticks a run takes, as our sub-tick model reads them (1/n is n runs a
 * tick). `calculatedDuration` is (int) max(duration, 1); below one tick the
 * ParallelHelper multiplies the parallels by `multiplierUnderOneTick`, then
 * caps them at what V x parallels pays for at the recipe's raw EU/t.
 *
 * @param duration recipe ticks x duration modifiers, after overclocks
 * @param subTickDuration the same before overclocks, which the multiplier reads
 */
export function gtnlSteamTicks(
  duration: number,
  {
    subTickDuration = duration,
    overclocks = 0,
    parallels,
    voltage,
    recipeEuT,
  }: { subTickDuration?: number; overclocks?: number; parallels: number; voltage: number; recipeEuT: number },
): number {
  if (!(duration > 0) || !Number.isFinite(duration)) return 1;
  const ticks = Math.max(1, Math.trunc(duration));
  const multiplier = multiplierUnderOneTick(subTickDuration, overclocks);
  if (multiplier <= 1) return ticks;
  const offered = parallels * multiplier;
  const runs = recipeEuT > 0 ? Math.min(offered, Math.floor((voltage * parallels) / Math.ceil(recipeEuT))) : offered;
  return runs > parallels ? (ticks * parallels) / runs : ticks;
}

/**
 * GTNLOverclockCalculator.calculateOverclock's step count for a machine that
 * does overclock (the Steam Supercompressor): power-of-four steps of the
 * machine's power over the recipe's, capped by voltage tiers (no amperage
 * overclocking). Both powers carry the same parallel count, so it cancels.
 */
export function gtnlSteamOverclocks(voltage: number, recipeEuT: number, euDiscount: number, parallels: number): number {
  const machinePower = voltage * parallels;
  const recipePower = recipeEuT * parallels * euDiscount;
  if (machinePower < recipePower) return 0;
  const scaled = Math.floor(Math.round(machinePower * 100) / Math.max(Math.round(recipePower * 100), 3200));
  const tiersAbove = scaled <= 1 ? 0 : Math.floor(Math.log2(scaled) / 2);
  const voltageTierMachine = Math.max(Math.ceil(Math.log(voltage / 8) / Math.log(4)), 1);
  const voltageTierRecipe = Math.max(Math.ceil(Math.log(recipeEuT / 8) / Math.log(4)), 1);
  return Math.max(0, Math.min(tiersAbove, voltageTierMachine - voltageTierRecipe));
}

/**
 * GTNL maps the dataset exports without handlers (one machine runs each, so
 * the pipeline leaves the map's name as the machine), keyed by GT's map id:
 * the machine that really runs them. Two of them share a display name with
 * another map ("Rock Breaker" with GT's, "Hydraulic Manufacturing" between
 * the Steam Manufacturer and the Perfect Steam Progenitor), so the id decides.
 */
export const GTNL_MAP_MACHINES: Record<string, string> = {
  "gtnl.recipe.steam_carpenter": "Steam Carpenter",
  "gtnl.recipe.steam_cracker": "Steam Cracker",
  "gtnl.recipe.lava_maker": "Steam Stone Superheater",
  "gtnl.recipe.steam_extractinator": "Steam Extractinator",
  "gtnl.recipe.rock_breaker": "Steam Rock Breaker",
  "gtnl.recipe.steam_manufacturer": "Steam Manufacturer",
  "gtnl.recipe.steam_gate_assembler": "Perfect Steam Progenitor",
  "gtnl.recipe.primitive_brick_kiln": "Updraft Kiln",
  "gtnl.recipe.infernal_coke_oven": "Infernal Coke Oven",
};

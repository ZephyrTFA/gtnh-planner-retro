import { t } from "@/lib/i18n";
import type { Recipe, RecipeInput, RecipeOutput } from "@/lib/model/types";
import { normalizeMachineName } from "./machine-table";
import { formulaNumber } from "./formula-lines";

/*
 * GT++'s ExxonMobil Chemical Plant wears its catalysts (GT5U 5.09.54.265,
 * MTEChemicalPlant#damageCatalyst). At the start of a run each parallel, in
 * turn, adds 1 damage with chance 1.2f - 0.2 x pipe tier (Bronze 1 .. Tungstensteel
 * 4). A catalyst breaks at 50 damage: it leaves an Empty Catalyst Carrier and the
 * loop stops, so the run's remaining parallels wear nothing. Catalysts sit one per
 * usage slot of the catalyst housing, so each one starts fresh at 0 damage.
 * Awakened Draconium coils (coil tier 10) or better with Tungstensteel pipes stop the wear.
 *
 * The dataset marks the catalyst `consumed: false`; a worn one becomes a consumed
 * input at its average a parallel, and the carrier an output at the same rate.
 */

export const CATALYST_DURABILITY = 50;
const UNBREAKABLE_COIL_TIER = 10;
const UNBREAKABLE_PIPE_TIER = 4;
const CATALYST_SAVE_PER_PIPE_TIER = 0.2;

/** The map GT++'s Chemical Plant runs. GT Not Leisure's Rockefeller runs it too, and never wears catalysts. */
const CHEMICAL_PLANT_MAP = "Chemical Plant";
const WEARING_MACHINES = new Set(["Chemical Plant", "ExxonMobil Chemical Plant"].map(normalizeMachineName));

/** The registered catalysts (MTEChemicalPlant's static block) that 2.9's Chemical Plant recipes use. */
const CATALYST_IDS = new Set([
  "miscutils:item.basicgenericchemitem@2", // Blue Metal
  "miscutils:item.basicgenericchemitem@3", // Orange Metal
  "miscutils:item.basicgenericchemitem@4", // Purple Metal
  "miscutils:item.basicgenericchemitem@5", // Brown Metal
  "miscutils:item.basicgenericchemitem@6", // Pink Metal
  "miscutils:item.basicgenericchemitem@13", // Formaldehyde
  "miscutils:item.basicgenericchemitem@14", // Solid-Acid
  "miscutils:item.basicgenericchemitem@15", // Infinite Mutation
  "miscutils:item.basicgenericchemitem@36", // Chlorination
  "miscutils:item.basicagrichemitem@14", // Green Metal
]);

/** GregtechItemList.EmptyCatalystCarrier. No art here: icons draw an artless item with the dataset's own. */
const CATALYST_CARRIER = {
  kind: "item",
  id: "miscutils:item.basicagrichemitem@13",
  displayName: "Catalyst Carrier",
  dominantColor: "#5b5b5b",
  modId: "miscutils",
} as const;

export interface ChemicalPlantBuild {
  /** GT's mPipeCasingTier: Bronze 1 .. Tungstensteel 4. */
  pipeTier: number;
  /** HeatingCoilLevel#getTier: Cupronickel 0 .. Awakened Draconium 10. */
  coilTier: number;
  /** Parallels a run actually takes (getCurrentParallels). */
  parallels: number;
}

function catalystInputIndex(recipe: Pick<Recipe, "inputs">): number {
  // The game wears the first catalyst it finds in the recipe, and only that one.
  return recipe.inputs.findIndex((input) => input.kind === "item" && CATALYST_IDS.has(input.id));
}

/** A Chemical Plant recipe whose catalyst the dataset left unconsumed. */
export function hasChemicalPlantCatalyst(recipe: Pick<Recipe, "inputs" | "machineType" | "source">): boolean {
  if ((recipe.source?.recipeMap ?? recipe.machineType) !== CHEMICAL_PLANT_MAP) return false;
  const index = catalystInputIndex(recipe);
  return index >= 0 && recipe.inputs[index].consumed === false;
}

/** Whether this machine (the card's selected handler) is GT++'s, the one that wears catalysts. */
export function wearsChemicalPlantCatalysts(machineType: string | undefined): boolean {
  return machineType !== undefined && WEARING_MACHINES.has(normalizeMachineName(machineType));
}

export function catalystWears(build: Pick<ChemicalPlantBuild, "pipeTier" | "coilTier">): boolean {
  return build.coilTier < UNBREAKABLE_COIL_TIER || build.pipeTier < UNBREAKABLE_PIPE_TIER;
}

/** A parallel's chance to add 1 damage. Java compares against 1.2f widened to double. */
export function catalystWearChance(pipeTier: number): number {
  return Math.min(1, Math.max(0, Math.fround(1.2) - CATALYST_SAVE_PER_PIPE_TIER * pipeTier));
}

const runsCache = new Map<string, number>();

/**
 * Average runs one catalyst lasts: the sum over k of P(still whole after k runs).
 * Each run draws `parallels` trials; the one that reaches 50 ends the catalyst
 * and the run, so the next catalyst starts on a fresh run.
 */
export function runsPerCatalyst(chance: number, parallels: number): number {
  const trials = Math.max(1, Math.floor(parallels));
  if (!(chance > 0)) return Infinity;
  const key = `${chance}|${trials}`;
  const cached = runsCache.get(key);
  if (cached !== undefined) return cached;

  const pmf: number[] = [1];
  for (let n = 0; n < trials; n++) {
    const next = new Array<number>(pmf.length + 1).fill(0);
    pmf.forEach((p, hits) => {
      next[hits] += p * (1 - chance);
      next[hits + 1] += p * chance;
    });
    pmf.splice(0, pmf.length, ...next);
  }

  let damage = new Float64Array(CATALYST_DURABILITY);
  damage[0] = 1;
  let whole = 1;
  let runs = 0;
  while (whole > 1e-13) {
    runs += whole;
    const next = new Float64Array(CATALYST_DURABILITY);
    for (let d = 0; d < CATALYST_DURABILITY; d++) {
      if (damage[d] === 0) continue;
      for (let hits = 0; hits < pmf.length && d + hits < CATALYST_DURABILITY; hits++) {
        next[d + hits] += damage[d] * pmf[hits];
      }
    }
    damage = next;
    whole = damage.reduce((sum, p) => sum + p, 0);
  }
  runsCache.set(key, runs);
  return runs;
}

/** Catalysts used up per parallel, on average. */
export function catalystsPerParallel(build: ChemicalPlantBuild): number {
  if (!catalystWears(build)) return 0;
  const parallels = Math.max(1, Math.floor(build.parallels));
  return 1 / (runsPerCatalyst(catalystWearChance(build.pipeTier), parallels) * parallels);
}

const worn = new WeakSet<Recipe>();

/**
 * The recipe as this build runs it: the catalyst used up at its average a
 * parallel and its carrier given back. A build that never wears it keeps the
 * dataset's unconsumed catalyst.
 */
export function applyCatalystWear(recipe: Recipe, build: ChemicalPlantBuild): Recipe {
  if (worn.has(recipe)) return recipe;
  const index = catalystInputIndex(recipe);
  if (index < 0 || recipe.inputs[index].consumed !== false) return recipe;
  const perParallel = catalystsPerParallel(build);
  if (perParallel === 0) return recipe;

  const parallels = Math.max(1, Math.floor(build.parallels));
  const chance = catalystWearChance(build.pipeTier);
  const used: RecipeInput = {
    ...recipe.inputs[index],
    amount: perParallel,
    consumed: true,
    machineNotes: [
      t("Each parallel has a {percent}% chance to use 1 of its {durability} uses. One lasts {runs} runs.", {
        percent: formulaNumber(Math.round(chance * 100)),
        durability: CATALYST_DURABILITY,
        runs: formulaNumber(runsPerCatalyst(chance, parallels)),
      }),
      t("Awakened Draconium coils or better with Tungstensteel pipe casings stop the wear."),
    ],
  };
  const carrier: RecipeOutput = {
    ...CATALYST_CARRIER,
    amount: perParallel,
    machineNotes: [t("Left behind when a catalyst wears out.")],
  };
  const result: Recipe = {
    ...recipe,
    inputs: recipe.inputs.map((input, i) => (i === index ? used : input)),
    outputs: [...recipe.outputs, carrier],
  };
  worn.add(result);
  return result;
}

import type { Recipe } from "@/lib/model/types";
import type { MachineHandlerIconEntry, RecipeMapIconEntry } from "./types";

/**
 * The addon a card's machine comes from, on an addon-set dataset. The chosen
 * handler's family says so when the map lists machines; a map with one machine
 * family carries no handlers (the card runs on a placeholder), so there the map
 * itself says whether every machine of it is an addon's.
 */
export function machineAddon(
  icons: { machineHandlerIcons?: readonly MachineHandlerIconEntry[]; recipeMapIcons?: readonly RecipeMapIconEntry[] },
  recipe: Pick<Recipe, "machineType" | "machineHandlers" | "source">,
  handlerId: string | undefined,
): string | undefined {
  const family = handlerId
    ? icons.machineHandlerIcons?.find((entry) => entry.familyId === handlerId)?.addon
    : undefined;
  if (family) return family;
  if (recipe.machineHandlers?.length) return undefined;
  const map = recipe.source?.recipeMap ?? recipe.machineType;
  return icons.recipeMapIcons?.find((entry) => entry.recipeMap === map)?.addon;
}

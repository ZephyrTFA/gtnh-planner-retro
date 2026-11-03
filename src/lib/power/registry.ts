/**
 * Every placeable power source, grouped for the picker. Source ids are
 * stored in plans (Recipe.power.sourceId); never rename a shipped id.
 */
import { msg } from "@/lib/i18n";
import { engineSources } from "./sources/engines";
import { endgameSources } from "./sources/endgame";
import { passiveSources, reactorSources } from "./sources/reactors";
import { singleblockSources } from "./sources/singleblocks";
import { sofcSources } from "./sources/sofc";
import { steamMakerSources } from "./sources/steam-makers";
import { turbineSources } from "./sources/turbines";
import type { PowerGroupId, PowerSourceDefinition } from "./types";

export const POWER_GROUPS: Array<{ id: PowerGroupId; name: string; blurb: string }> = [
  { id: "burners", name: msg("Generators"), blurb: msg("Singleblocks: one amp of their tier from fuel.") },
  { id: "engines", name: msg("Engines"), blurb: msg("The big fuel burners: engines and fuel cells.") },
  { id: "steam", name: msg("Boilers and exchangers"), blurb: msg("Everything that makes steam.") },
  { id: "turbines", name: msg("Turbines"), blurb: msg("Steam, gas and plasma through a rotor.") },
  { id: "reactors", name: msg("Reactors"), blurb: msg("Nuclear heat, pebbles and salts.") },
  { id: "passive", name: msg("Solar"), blurb: msg("Power from the sky.") },
  { id: "endgame", name: msg("Endgame"), blurb: msg("Naquadah, fusion, antimatter.") },
];

export const POWER_SOURCES: PowerSourceDefinition[] = [
  ...singleblockSources,
  ...engineSources,
  ...sofcSources,
  ...steamMakerSources,
  ...turbineSources,
  ...reactorSources,
  ...passiveSources,
  ...endgameSources,
];

const byId = new Map(POWER_SOURCES.map((source) => [source.id, source]));

export function getPowerSource(sourceId: string): PowerSourceDefinition | undefined {
  return byId.get(sourceId);
}

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip, gzipSync, gunzipSync } from "node:zlib";

/**
 * Item and fluid names in another language, for a dataset that was exported in
 * English. A locale export (run-locale-names-in-docker.sh) normalizes the same
 * pack with the client set to that language; resource ids come from registry
 * names, so they match the English dataset's, and only the names differ.
 *
 * The file keeps a name only where it differs from English: a missing entry
 * means the game shows the English name too (untranslated, or a proper noun).
 */

/** Resource id -> display name, streamed from a normalized recipes.json's `resources` array. */
export async function readResourceNames(recipesPath) {
  const names = new Map();
  const input = fs.createReadStream(recipesPath);
  const lines = readline.createInterface({
    input: recipesPath.endsWith(".gz") ? input.pipe(createGunzip()) : input,
    crlfDelay: Infinity,
  });
  let inResources = false;
  for await (const line of lines) {
    if (!inResources) {
      // dataset-json-writer.mjs puts each top-level array entry on its own line.
      if (/^ {2}"resources": \[/.test(line)) inResources = true;
      continue;
    }
    if (/^ {2}\]/.test(line)) break;
    const entry = line.trim().replace(/,$/, "");
    if (!entry.startsWith("{")) continue;
    const resource = JSON.parse(entry);
    if (resource.id && resource.displayName) names.set(resource.id, resource.displayName);
  }
  return names;
}

/**
 * The planner composes its own resources' names (bee species, CropsNH seeds,
 * mob spawners) from a game name plus English words ("<species> Bee"), so a
 * locale export would give half-translated names; they stay English.
 */
const COMPOSED_BY_THE_PLANNER = "factoryflow:";

/** The names that differ from English, sorted by id for a stable file. */
export function translatedNames(localized, english) {
  const out = {};
  for (const id of [...localized.keys()].sort()) {
    if (id.startsWith(COMPOSED_BY_THE_PLANNER)) continue;
    const name = localized.get(id);
    const englishName = english.get(id);
    if (englishName !== undefined && name && name !== englishName) out[id] = name;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [localizedRecipes, englishResourceIndex, outPath, locale] = process.argv.slice(2);
  if (!localizedRecipes || !englishResourceIndex || !outPath || !locale) {
    throw new Error(
      "Usage: extract-locale-names.mjs <localized recipes.json> <english resource-index.json.gz> <out.json.gz> <locale>",
    );
  }
  const index = JSON.parse(gunzipSync(fs.readFileSync(englishResourceIndex)).toString("utf8"));
  const english = new Map(index.resources.map((resource) => [resource.id, resource.displayName]));
  const names = translatedNames(await readResourceNames(localizedRecipes), english);
  const count = Object.keys(names).length;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    gzipSync(JSON.stringify({ schemaVersion: 1, locale, datasetVersionId: index.datasetVersionId, names })),
  );
  console.log(`Wrote ${count} ${locale} names of ${english.size} resources to ${outPath}.`);
}

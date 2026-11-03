import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Addon sets: extra mods dropped into the official pack before the export, so a
 * dataset can cover GTNH plus addons (tools/dataset-pipeline/addons/<id>.json).
 *
 * Every jar is pinned by URL and sha256 and is checked before it reaches the
 * pack: an addon set must rebuild the same dataset from the same spec, and a
 * jar that changed upstream must stop the run instead of landing silently. A set
 * names the GTNH version it was built for; running it against another pack is
 * refused, since addon jars are tied to one GregTech release.
 *
 * `recipeHooks` names the static methods a mod saves for a world to load (server
 * started, player joined). The oracle exports from the main menu, so it calls them
 * itself before reading the maps; without them those recipes never reach a dataset.
 */

const SET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
// A public static no-arg method: package.Class.method.
const HOOK = /^(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/;

export const addonSetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "addons");

export function parseAddonSet(raw, expectedId) {
  const fail = (message) => {
    throw new Error(`Addon set ${expectedId ?? raw?.id ?? "?"}: ${message}`);
  };
  if (!raw || typeof raw !== "object") fail("spec is not an object.");
  if (typeof raw.id !== "string" || !SET_ID.test(raw.id)) fail("id must be lower-case words joined by '-'.");
  if (expectedId !== undefined && raw.id !== expectedId) fail(`id is ${raw.id}, the file name says ${expectedId}.`);
  if (typeof raw.label !== "string" || !raw.label.trim()) fail("label is required.");
  if (typeof raw.gtnhVersion !== "string" || !raw.gtnhVersion.trim()) fail("gtnhVersion is required.");
  if (!Array.isArray(raw.mods) || raw.mods.length === 0) fail("mods must list at least one jar.");
  const fileNames = new Set();
  const mods = raw.mods.map((mod, index) => {
    const where = `mods[${index}]`;
    for (const key of ["name", "version", "url", "sha256"]) {
      if (typeof mod?.[key] !== "string" || !mod[key].trim()) fail(`${where}.${key} is required.`);
    }
    let url;
    try {
      url = new URL(mod.url);
    } catch {
      fail(`${where}.url is not a URL.`);
    }
    if (url.protocol !== "https:") fail(`${where}.url must be https.`);
    const fileName = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    if (!fileName.toLowerCase().endsWith(".jar")) fail(`${where}.url must name a .jar file.`);
    if (fileNames.has(fileName)) fail(`${fileName} is listed twice.`);
    fileNames.add(fileName);
    const sha256 = mod.sha256.toLowerCase();
    if (!SHA256.test(sha256)) fail(`${where}.sha256 must be 64 hex digits.`);
    return { name: mod.name, version: mod.version, url: url.toString(), sha256, fileName };
  });
  const recipeHooks = raw.recipeHooks ?? [];
  if (!Array.isArray(recipeHooks)) fail("recipeHooks must be a list.");
  for (const [index, hook] of recipeHooks.entries()) {
    if (typeof hook !== "string" || !HOOK.test(hook)) fail(`recipeHooks[${index}] must name package.Class.method.`);
  }
  return { id: raw.id, label: raw.label.trim(), gtnhVersion: raw.gtnhVersion.trim(), mods, recipeHooks };
}

export async function loadAddonSet(id, dir = addonSetsDir) {
  if (!SET_ID.test(id)) throw new Error(`Addon set id ${JSON.stringify(id)} is not a valid id.`);
  const file = path.join(dir, `${id}.json`);
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  return parseAddonSet(raw, id);
}

/**
 * Copies every jar of the set into `modsDir`, fetching into `cacheDir` first
 * (keyed by checksum, so a re-run of the same set never downloads twice).
 * Returns the record of what went in.
 */
export async function installAddonMods({ set, modsDir, cacheDir, gtnhVersion, fetchImpl = fetch, log = console.log }) {
  if (gtnhVersion !== undefined && gtnhVersion !== set.gtnhVersion) {
    throw new Error(
      `Addon set ${set.id} is pinned to GTNH ${set.gtnhVersion}, but this pack is GTNH ${gtnhVersion}.`,
    );
  }
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(modsDir, { recursive: true });
  const existing = new Set((await fs.readdir(modsDir)).map((name) => name.toLowerCase()));
  for (const mod of set.mods) {
    if (existing.has(mod.fileName.toLowerCase())) {
      throw new Error(`The pack already ships ${mod.fileName}; an addon set must only add mods.`);
    }
  }

  for (const mod of set.mods) {
    const cached = path.join(cacheDir, `${mod.sha256}.jar`);
    let bytes = await fs.readFile(cached).catch(() => undefined);
    if (bytes && sha256Of(bytes) !== mod.sha256) {
      bytes = undefined;
    }
    if (!bytes) {
      log(`Downloading addon ${mod.name} ${mod.version}: ${mod.url}`);
      const response = await fetchImpl(mod.url, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`Addon ${mod.name} download failed: ${response.status} ${response.statusText}.`);
      }
      bytes = Buffer.from(await response.arrayBuffer());
      const actual = sha256Of(bytes);
      if (actual !== mod.sha256) {
        throw new Error(
          `Addon ${mod.name} ${mod.version} checksum mismatch: expected ${mod.sha256}, got ${actual}. ` +
            "The upstream file changed; check the release before updating the pin.",
        );
      }
      await fs.writeFile(cached, bytes);
    } else {
      log(`Using cached addon ${mod.name} ${mod.version}.`);
    }
    await fs.writeFile(path.join(modsDir, mod.fileName), bytes);
  }

  return {
    id: set.id,
    label: set.label,
    gtnhVersion: set.gtnhVersion,
    mods: set.mods.map(({ name, version, url, sha256 }) => ({ name, version, url, sha256 })),
    recipeHooks: set.recipeHooks,
  };
}

/**
 * Class name -> mod name for every class in the set's jars (`entriesByMod`:
 * mod name -> the jar's entry names). Multi-release copies under META-INF are
 * the same classes again and are skipped. Normalization reads this to tell
 * which machines an addon adds.
 */
export function classOwnersFromEntries(entriesByMod) {
  const owners = {};
  for (const [mod, entries] of Object.entries(entriesByMod)) {
    for (const entry of entries) {
      if (!entry.endsWith(".class") || entry.startsWith("META-INF/")) continue;
      owners[entry.slice(0, -".class".length).replaceAll("/", ".")] = mod;
    }
  }
  return owners;
}

function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [setId, modsDir, recordPath, classesPath] = process.argv.slice(2);
  if (!setId || !modsDir || !recordPath || !classesPath) {
    throw new Error("Usage: install-addon-mods.mjs <addon set id> <mods dir> <record.json> <classes.json>");
  }
  const set = await loadAddonSet(setId);
  const record = await installAddonMods({
    set,
    modsDir,
    cacheDir: process.env.GTNH_ADDON_CACHE_DIR || path.join(".pipeline", "addon-cache"),
    gtnhVersion: process.env.GTNH_DATASET_VERSION_LABEL || undefined,
  });
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const entriesByMod = Object.fromEntries(
    set.mods.map((mod) => [
      mod.name,
      execFileSync("unzip", ["-Z1", path.join(modsDir, mod.fileName)], { encoding: "utf8", maxBuffer: 64 << 20 })
        .split("\n")
        .filter(Boolean),
    ]),
  );
  await fs.writeFile(classesPath, JSON.stringify(classOwnersFromEntries(entriesByMod)));
  console.log(`Installed addon set ${set.id}: ${set.mods.map((mod) => `${mod.name} ${mod.version}`).join(", ")}.`);
}

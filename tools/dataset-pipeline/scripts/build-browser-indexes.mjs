#!/usr/bin/env node
/**
 * Work the browser would otherwise do on every first visit, done once here.
 * The dataset worker (src/lib/dataset-engine) reads both forms; answers are
 * identical either way.
 *
 * - resource-index.json.gz gains `directionCounts` ([kind:id, madeBy, usedBy]
 *   per resource, summed from the lookup index exactly as the engine does), so
 *   the item list sorts without downloading the recipe lookup index at all.
 * - recipe-lookup-index.json.gz trades `searchText` (about 140 MiB of text for
 *   2.9.0) for `searchTokens` (each distinct word once) and `searchTokenIds`
 *   (each recipe's words as numbers, split by the app's own splitSearchTokens),
 *   so the browser builds its search index from integers instead of text.
 *
 * Usage:
 *   build-browser-indexes.mjs <dataset-version-dir>                  in place (a build)
 *   build-browser-indexes.mjs <dataset-version-dir> --out <new-dir>  into a copy; the source is read only
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const sourceDir = args.find((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
  const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;
  if (!sourceDir || !fs.existsSync(path.join(sourceDir, "recipe-lookup-index.json.gz"))) {
    throw new Error("Usage: build-browser-indexes.mjs <dataset-version-dir> [--out <new-dir>]");
  }
  await buildBrowserIndexes({ sourceDir: path.resolve(sourceDir), outDir: outDir && path.resolve(outDir) });
}

export async function buildBrowserIndexes({ sourceDir, outDir, encodeSearchTokens }) {
  const workDir = outDir ?? sourceDir;
  if (outDir) {
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.cp(sourceDir, outDir, { recursive: true });
  }
  const encode = encodeSearchTokens ?? (await loadAppTokenizer());
  const lookupFile = path.join(workDir, "recipe-lookup-index.json.gz");
  const resourceIndexFile = path.join(workDir, "resource-index.json.gz");
  const lookup = readGzipJson(lookupFile);
  const resourceIndex = readGzipJson(resourceIndexFile);

  resourceIndex.directionCounts = directionCountsOf(lookup.entries);
  writeGzipJson(resourceIndexFile, resourceIndex);

  let words = lookup.searchTokens?.length ?? 0;
  if (Array.isArray(lookup.searchText)) {
    const { vocabulary, tokenIds } = encode(lookup.searchText);
    delete lookup.searchText;
    lookup.searchTokens = vocabulary;
    lookup.searchTokenIds = tokenIds;
    words = vocabulary.length;
    writeGzipJson(lookupFile, lookup);
  }
  const summary = { resources: resourceIndex.directionCounts.length, recipes: lookup.recipeCount, distinctWords: words };
  console.log(`Browser indexes for ${resourceIndex.datasetVersionId}: ${JSON.stringify(summary)}`);
  return summary;
}

/** Made-by / used-by recipe counts per resource, as the engine's getResourceDirectionCounts sums them. */
export function directionCountsOf(entries) {
  const counts = new Map();
  for (const [key, recipesByMap] of entries) {
    let total = 0;
    for (const [, recipeIndexes] of recipesByMap) total += recipeIndexes.length;
    const colon = key.indexOf(":");
    const mode = key.slice(0, colon);
    const resourceKey = key.slice(colon + 1);
    const entry = counts.get(resourceKey) ?? [resourceKey, 0, 0];
    if (mode === "recipes") entry[1] += total;
    else if (mode === "uses") entry[2] += total;
    counts.set(resourceKey, entry);
  }
  return [...counts.values()];
}

/** The app's own word splitting, so the pipeline and the browser agree on every token. */
async function loadAppTokenizer() {
  const bundleFile = path.join(os.tmpdir(), `search-tokens-${process.pid}.mjs`);
  await build({
    stdin: { contents: `export { encodeSearchTokens } from "./src/lib/search/text-index.ts";`, resolveDir: repoRoot, loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundleFile,
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    logLevel: "warning",
  });
  try {
    return (await import(pathToFileURL(bundleFile).href)).encodeSearchTokens;
  } finally {
    await fsp.rm(bundleFile, { force: true });
  }
}

function readGzipJson(file) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

function writeGzipJson(file, value) {
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(value), { level: 9 }));
}

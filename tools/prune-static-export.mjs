#!/usr/bin/env node
// After `next build`: take the dataset files the browser never reads out of
// out/, then check the export against a static host's limits (Cloudflare
// Workers static assets: 25 MiB per file, 20,000 files on the free plan,
// 100,000 on paid). The browser reads the manifest, the resource and lookup
// indexes, the recipe shards and textures; the full recipes.json(.gz), the
// recipe index (only read when a dataset has no lookup index), the exporter's
// report and the workers' source maps are not shipped.
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.resolve(process.argv[2] ?? "out");
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FREE_PLAN_FILES = 20_000;
const PAID_PLAN_FILES = 100_000;
const NOT_FOR_BROWSER = new Set(["recipes.json", "recipes.json.gz", "oracle-report.json"]);
// With NEXT_PUBLIC_ICON_BASE_URL set, rendered icons are served from that host
// (there are more of them than a static host takes files), so the export
// leaves them out. Unset, the site serves its own and they stay.
const iconsElsewhere = Boolean(process.env.NEXT_PUBLIC_ICON_BASE_URL?.trim());

const datasetsDir = path.join(outDir, "datasets", "gtnh");
let prunedBytes = 0;
let prunedFiles = 0;
for (const version of await readDirOrEmpty(datasetsDir)) {
  if (!version.isDirectory()) {
    continue;
  }
  const versionDir = path.join(datasetsDir, version.name);
  const hasLookupIndex = (await readDirOrEmpty(versionDir)).some((entry) => entry.name === "recipe-lookup-index.json.gz");
  for (const entry of await readDirOrEmpty(versionDir)) {
    if (
      entry.isFile() &&
      (NOT_FOR_BROWSER.has(entry.name) ||
        entry.name.endsWith(".log") ||
        (hasLookupIndex && entry.name === "recipe-index.json.gz"))
    ) {
      await prune(path.join(versionDir, entry.name));
    }
  }
  // Every icon must be this site's own file: an asset: path (a mod texture the
  // pipeline did not resolve) draws nothing and trips the CSP.
  const resourceIndex = path.join(versionDir, "resource-index.json.gz");
  const indexText = await fs.readFile(resourceIndex).then((bytes) => zlib.gunzipSync(bytes).toString("utf8"), () => "");
  const unresolved = indexText.match(/"iconPath":"asset:[^"]*"/g) ?? [];
  if (unresolved.length > 0) {
    console.error(`${version.name}: ${unresolved.length} icons are unresolved asset: paths, e.g. ${unresolved[0]}. Rebuild the sheets with --assets.`);
    process.exitCode = 1;
  }
  // The exporter's reports: pipeline output, never read by the app.
  await prune(path.join(versionDir, "oracle"));
  for (const entry of await readDirOrEmpty(path.join(versionDir, "textures"))) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      await prune(path.join(versionDir, "textures", entry.name));
    }
  }
  if (iconsElsewhere) {
    await prune(path.join(versionDir, "textures", "rendered"));
  }
}

async function prune(target) {
  for await (const file of walkOrFile(target)) {
    prunedBytes += (await fs.stat(file)).size;
    prunedFiles += 1;
  }
  await fs.rm(target, { recursive: true, force: true });
}

async function* walkOrFile(target) {
  const stats = await fs.stat(target).catch(() => undefined);
  if (stats?.isDirectory()) {
    yield* walk(target);
  } else if (stats?.isFile()) {
    yield target;
  }
}

// Source maps of the bundled workers: debugging aid, not part of the site.
for (const entry of await readDirOrEmpty(path.join(outDir, "workers"))) {
  if (entry.isFile() && entry.name.endsWith(".map")) {
    await prune(path.join(outDir, "workers", entry.name));
  }
}

let fileCount = 0;
let totalBytes = 0;
let largest = { file: "", size: 0 };
const tooLarge = [];
for await (const file of walk(outDir)) {
  const { size } = await fs.stat(file);
  fileCount += 1;
  totalBytes += size;
  if (size > largest.size) {
    largest = { file, size };
  }
  if (size > MAX_FILE_BYTES) {
    tooLarge.push({ file, size });
  }
}

console.log(
  `Pruned ${prunedFiles} dataset files the browser does not read from this site (${mib(prunedBytes)})` +
    (iconsElsewhere ? `; rendered icons come from ${process.env.NEXT_PUBLIC_ICON_BASE_URL}.` : "."),
);
console.log(`out/: ${fileCount} files, ${mib(totalBytes)}; largest ${path.relative(outDir, largest.file)} (${mib(largest.size)}).`);
if (fileCount > PAID_PLAN_FILES) {
  console.error(`Too many files for Cloudflare static assets: ${fileCount} > ${PAID_PLAN_FILES}.`);
  process.exitCode = 1;
} else if (fileCount > FREE_PLAN_FILES) {
  console.warn(`More than ${FREE_PLAN_FILES} files: Cloudflare's free plan refuses this; the paid plan takes up to ${PAID_PLAN_FILES}.`);
}
for (const { file, size } of tooLarge) {
  console.error(`Over the 25 MiB per-file limit: ${path.relative(outDir, file)} (${mib(size)}).`);
  process.exitCode = 1;
}

async function readDirOrEmpty(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

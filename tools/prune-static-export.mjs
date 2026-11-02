#!/usr/bin/env node
// After `next build`: take the dataset files the browser never reads out of
// out/, then check the export against a static host's limits (Cloudflare
// Workers static assets: 25 MiB per file, 20,000 files on the free plan,
// 100,000 on paid). The browser reads the manifest, the resource, recipe and
// lookup indexes, the recipe shards and textures; the full recipes.json(.gz)
// and the exporter's report are pipeline output only.
import fs from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve(process.argv[2] ?? "out");
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FREE_PLAN_FILES = 20_000;
const PAID_PLAN_FILES = 100_000;
const NOT_FOR_BROWSER = new Set(["recipes.json", "recipes.json.gz", "oracle-report.json"]);

const datasetsDir = path.join(outDir, "datasets", "gtnh");
let prunedBytes = 0;
let prunedFiles = 0;
for (const version of await readDirOrEmpty(datasetsDir)) {
  if (!version.isDirectory()) {
    continue;
  }
  for (const entry of await readDirOrEmpty(path.join(datasetsDir, version.name))) {
    if (entry.isFile() && (NOT_FOR_BROWSER.has(entry.name) || entry.name.endsWith(".log"))) {
      const file = path.join(datasetsDir, version.name, entry.name);
      prunedBytes += (await fs.stat(file)).size;
      prunedFiles += 1;
      await fs.rm(file);
    }
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

console.log(`Pruned ${prunedFiles} dataset files the browser never reads (${mib(prunedBytes)}).`);
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

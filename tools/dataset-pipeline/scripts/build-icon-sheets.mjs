#!/usr/bin/env node
/**
 * Rendered icons into sprite sheets, so a dataset ships as a few thousand
 * files instead of a hundred thousand (a static host such as Cloudflare
 * Workers takes 20,000 files on its free plan, 25 MiB each).
 *
 * - Every icon the dataset references (resource index and recipe shards) is
 *   downscaled 256 -> 128 nearest-neighbour (the art is pixel art in the
 *   middle half of its canvas; the app draws icons at most about 128 CSS px)
 *   and deduplicated by its pixels.
 * - Icons are packed 64 to a sheet (8 x 8 cells of 128 px) as lossless WebP,
 *   in the order the item list opens in (so a page of the list is one or two
 *   sheets), then everything else grouped by mod and id.
 * - Sheet names carry a content hash (textures/sheets/sheet-<hash>.webp), so
 *   they can be cached forever.
 * - Every `iconPath` into textures/rendered becomes the app's `iconAtlas` ref,
 *   and textures/rendered is not part of the output.
 *
 * Usage:
 *   build-icon-sheets.mjs <dataset-version-dir>                  in place (a build)
 *   build-icon-sheets.mjs <dataset-version-dir> --out <new-dir>  into a copy; the source is read only
 *
 * Needs `cwebp` (libwebp; the pipeline image installs the `webp` package).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { build } from "esbuild";

export const CELL = 128;
export const COLUMNS = 8;
export const ROWS = 8;
export const PER_SHEET = COLUMNS * ROWS;
const RENDERED_MARK = "/textures/rendered/";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const sourceDir = args.find((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
  const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;
  if (!sourceDir || !fs.existsSync(path.join(sourceDir, "resource-index.json.gz"))) {
    throw new Error("Usage: build-icon-sheets.mjs <dataset-version-dir> [--out <new-dir>]");
  }
  await buildIconSheets({ sourceDir: path.resolve(sourceDir), outDir: outDir && path.resolve(outDir) });
}

export async function buildIconSheets({ sourceDir, outDir, encode = encodeWebpWithCwebp, order }) {
  const workDir = outDir ?? sourceDir;
  const renderedDir = path.join(sourceDir, "textures", "rendered");
  if (!fs.existsSync(renderedDir)) {
    console.log("No textures/rendered in the dataset; nothing to pack.");
    return undefined;
  }
  if (encode === encodeWebpWithCwebp) {
    assertCwebp();
  }
  if (outDir) {
    await fsp.rm(outDir, { recursive: true, force: true });
    // Everything but the loose icons, which become sheets.
    await fsp.cp(sourceDir, outDir, {
      recursive: true,
      filter: (src) => !src.startsWith(renderedDir),
    });
  }

  const resourceIndexFile = path.join(workDir, "resource-index.json.gz");
  const resourceIndex = readGzipJson(resourceIndexFile);
  const versionId = resourceIndex.datasetVersionId;
  const shardFiles = listShards(workDir);

  // Every referenced icon with the resource that shows it.
  const owners = new Map();
  const note = (node) => {
    if (typeof node.iconPath === "string" && node.iconPath.includes(RENDERED_MARK) && !owners.has(node.iconPath)) {
      owners.set(node.iconPath, `${node.modId ?? ""}|${node.id ?? ""}`);
    }
  };
  walkIconHolders(resourceIndex, note);
  for (const file of shardFiles) {
    walkIconHolders(readGzipJson(file), note);
  }

  // The item list as it opens first, then everything else by mod and id.
  const listOrder = order ?? (await itemListIconOrder(sourceDir, versionId));
  const ordered = [];
  const seen = new Set();
  for (const iconPath of listOrder) {
    if (owners.has(iconPath) && !seen.has(iconPath)) {
      seen.add(iconPath);
      ordered.push(iconPath);
    }
  }
  const rest = [...owners.keys()].filter((iconPath) => !seen.has(iconPath));
  rest.sort((left, right) => owners.get(left).localeCompare(owners.get(right)) || left.localeCompare(right));
  ordered.push(...rest);

  // One pass: decode, downscale, dedupe by pixels, blit into the current sheet.
  const sheetsDir = path.join(workDir, "textures", "sheets");
  await fsp.rm(sheetsDir, { recursive: true, force: true });
  await fsp.mkdir(sheetsDir, { recursive: true });
  const cellByHash = new Map();
  const placeByPath = new Map();
  const sheetFiles = [];
  const encodes = [];
  let sheet = newSheetBuffer();
  let cellsInSheet = 0;
  let missing = 0;
  const flush = () => {
    if (cellsInSheet === 0) return;
    const index = sheetFiles.length;
    const rows = Math.ceil(cellsInSheet / COLUMNS);
    const pixels = sheet.subarray(0, COLUMNS * CELL * rows * CELL * 4);
    sheetFiles.push(undefined);
    encodes.push(
      encode(pixels, COLUMNS * CELL, rows * CELL).then(async (bytes) => {
        const name = `sheet-${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.webp`;
        await fsp.writeFile(path.join(sheetsDir, name), bytes);
        sheetFiles[index] = { name, width: COLUMNS * CELL, height: rows * CELL, bytes: bytes.length };
      }),
    );
    sheet = newSheetBuffer();
    cellsInSheet = 0;
  };
  for (const iconPath of ordered) {
    const file = path.join(renderedDir, path.basename(iconPath));
    let cell;
    try {
      cell = downscaleToCell(PNG.sync.read(fs.readFileSync(file)));
    } catch {
      missing += 1;
      continue;
    }
    const hash = crypto.createHash("sha1").update(cell).digest("hex");
    let place = cellByHash.get(hash);
    if (!place) {
      place = { sheet: sheetFiles.length, x: (cellsInSheet % COLUMNS) * CELL, y: Math.floor(cellsInSheet / COLUMNS) * CELL };
      blit(sheet, cell, place.x, place.y);
      cellByHash.set(hash, place);
      cellsInSheet += 1;
      if (cellsInSheet === PER_SHEET) flush();
    }
    placeByPath.set(iconPath, place);
    // Keep a bounded number of encodes in flight.
    if (encodes.length % 32 === 0) await Promise.all(encodes.splice(0));
  }
  flush();
  await Promise.all(encodes);

  // Every reference becomes an atlas ref into its sheet.
  const atlasFor = (iconPath) => {
    const place = placeByPath.get(iconPath);
    if (!place) return undefined;
    const sheetFile = sheetFiles[place.sheet];
    return {
      imagePath: `/datasets/gtnh/${versionId}/textures/sheets/${sheetFile.name}`,
      atlasWidth: sheetFile.width,
      atlasHeight: sheetFile.height,
      x: place.x,
      y: place.y,
      width: CELL,
      height: CELL,
    };
  };
  let rewritten = 0;
  let dropped = 0;
  const rewrite = (node) => {
    if (typeof node.iconPath !== "string" || !node.iconPath.includes(RENDERED_MARK)) return;
    const atlas = atlasFor(node.iconPath);
    delete node.iconPath;
    if (atlas) {
      node.iconAtlas = atlas;
      rewritten += 1;
    } else {
      // An icon the export never wrote: no art beats a broken image.
      dropped += 1;
    }
  };
  walkIconHolders(resourceIndex, rewrite);
  writeGzipJson(resourceIndexFile, resourceIndex);
  for (const file of shardFiles) {
    const shard = readGzipJson(file);
    walkIconHolders(shard, rewrite);
    writeGzipJson(file, shard);
  }
  if (!outDir) {
    await fsp.rm(renderedDir, { recursive: true, force: true });
  }

  const sheetBytes = sheetFiles.reduce((sum, file) => sum + file.bytes, 0);
  const summary = {
    referencedIcons: ordered.length,
    distinctIcons: cellByHash.size,
    missingIcons: missing,
    sheets: sheetFiles.length,
    sheetMiB: +(sheetBytes / 1048576).toFixed(1),
    referencesRewritten: rewritten,
    referencesDropped: dropped,
  };
  console.log(`Icon sheets for ${versionId}: ${JSON.stringify(summary)}`);
  return summary;
}

/** Calls `visit` on every object that holds a resource's art (an `iconPath` or `iconAtlas`). */
export function walkIconHolders(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkIconHolders(item, visit);
  } else if (value && typeof value === "object") {
    if ("iconPath" in value || "iconAtlas" in value) visit(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") walkIconHolders(child, visit);
    }
  }
}

/** Nearest-neighbour to a 128 px cell: pixel art stays crisp, and a 2:1 step drops no detail the app can show. */
export function downscaleToCell(png) {
  const cell = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y += 1) {
    const sy = Math.min(png.height - 1, Math.floor(((y + 0.5) * png.height) / CELL));
    for (let x = 0; x < CELL; x += 1) {
      const sx = Math.min(png.width - 1, Math.floor(((x + 0.5) * png.width) / CELL));
      png.data.copy(cell, (y * CELL + x) * 4, (sy * png.width + sx) * 4, (sy * png.width + sx) * 4 + 4);
    }
  }
  return cell;
}

function newSheetBuffer() {
  return Buffer.alloc(COLUMNS * CELL * ROWS * CELL * 4);
}

function blit(sheet, cell, left, top) {
  const stride = COLUMNS * CELL * 4;
  for (let row = 0; row < CELL; row += 1) {
    cell.copy(sheet, (top + row) * stride + left * 4, row * CELL * 4, (row + 1) * CELL * 4);
  }
}

/** Lossless WebP through cwebp: exact pixels, a fraction of the PNG size. */
export async function encodeWebpWithCwebp(pixels, width, height) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "icon-sheet-"));
  try {
    const png = new PNG({ width, height });
    pixels.copy(png.data);
    const input = path.join(tmp, "sheet.png");
    const output = path.join(tmp, "sheet.webp");
    await fsp.writeFile(input, PNG.sync.write(png, { deflateLevel: 1 }));
    await new Promise((resolve, reject) => {
      const child = spawn("cwebp", ["-quiet", "-lossless", "-z", "9", input, "-o", output], { stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`cwebp exited ${code}`))));
    });
    return await fsp.readFile(output);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

function assertCwebp() {
  const probe = spawnSync("cwebp", ["-version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error("cwebp not found: install libwebp (apt: webp; nix: nixpkgs#libwebp).");
  }
}

/**
 * The item list's opening order (an empty search, its default sort), asked of
 * the app's own recipe engine so the sheets follow what players scroll first.
 */
async function itemListIconOrder(sourceDir, versionId) {
  const bundleFile = path.join(os.tmpdir(), `dataset-engine-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        `export { setDatasetFileSource } from "./src/lib/dataset-engine/source.ts";`,
        `export { queryDatasetResources } from "./src/lib/dataset-engine/engine.ts";`,
      ].join("\n"),
      resolveDir: repoRoot,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundleFile,
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    external: ["highs"],
    logLevel: "warning",
  });
  try {
    const engine = await import(pathToFileURL(bundleFile).href);
    const prefix = `/datasets/gtnh/${versionId}/`;
    engine.setDatasetFileSource({
      async loadManifest() {
        return {
          schemaVersion: 1,
          versions: [
            {
              id: versionId,
              gtnhVersion: "",
              channel: "stable",
              publishedAt: "",
              manifestPath: "",
              recipeDatasetPath: `${prefix}recipes.json.gz`,
              resourceIndexPath: `${prefix}resource-index.json.gz`,
              recipeIndexPath: `${prefix}recipe-index.json.gz`,
              recipeLookupIndexPath: `${prefix}recipe-lookup-index.json.gz`,
            },
          ],
        };
      },
      async readGzipJson(publicPath) {
        // The untouched source: the order is about what the list shows.
        return readGzipJson(path.join(sourceDir, publicPath.slice(prefix.length)));
      },
    });
    const result = await engine.queryDatasetResources(versionId, {
      query: "",
      offset: 0,
      limit: 1_000_000,
      sort: "popular",
    });
    return result.resources.map((resource) => resource.iconPath).filter(Boolean);
  } finally {
    await fsp.rm(bundleFile, { force: true });
  }
}

function listShards(dir) {
  const shardDir = path.join(dir, "recipes-shards");
  if (!fs.existsSync(shardDir)) return [];
  return fs
    .readdirSync(shardDir)
    .filter((name) => name.endsWith(".json.gz"))
    .sort()
    .map((name) => path.join(shardDir, name));
}

function readGzipJson(file) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

function writeGzipJson(file, value) {
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(value), { level: 9 }));
}

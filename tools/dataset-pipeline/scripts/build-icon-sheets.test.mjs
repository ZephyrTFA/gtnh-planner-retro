import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildIconSheets, CELL } from "./build-icon-sheets.mjs";

const V = "test-v";
const rendered = (name) => `/datasets/gtnh/${V}/textures/rendered/${name}`;
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A 256 px icon: a 2x2-pixel block of colour per art pixel, as the renderer doubles pixel art. */
function icon(rgba) {
  const png = new PNG({ width: 256, height: 256 });
  for (let i = 0; i < 256 * 256; i += 1) png.data.set(rgba, i * 4);
  return PNG.sync.write(png);
}

function gz(value) {
  return zlib.gzipSync(JSON.stringify(value));
}

function readGz(file) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-sheets-"));
  dirs.push(dir);
  const source = path.join(dir, "source");
  fs.mkdirSync(path.join(source, "textures", "rendered"), { recursive: true });
  fs.mkdirSync(path.join(source, "recipes-shards"));
  const red = icon([255, 0, 0, 255]);
  fs.writeFileSync(path.join(source, "textures", "rendered", "iron-1.png"), red);
  // The same pixels under another name: one cell for both.
  fs.writeFileSync(path.join(source, "textures", "rendered", "iron-copy-2.png"), red);
  fs.writeFileSync(path.join(source, "textures", "rendered", "water-3.png"), icon([0, 0, 255, 128]));
  fs.writeFileSync(
    path.join(source, "resource-index.json.gz"),
    gz({
      datasetVersionId: V,
      resourceIndex: [
        { kind: "item", id: "mod:iron", iconPath: rendered("iron-1.png"), dominantColor: "#ff0000" },
        { kind: "fluid", id: "water", iconPath: rendered("water-3.png") },
        { kind: "aspect", id: "aer", iconPath: "/nei/thaumcraft/aspects/aer.png" },
        { kind: "item", id: "mod:gone", iconPath: rendered("never-written.png") },
      ],
      machineHandlerIcons: [{ resource: { kind: "item", id: "mod:iron2", iconPath: rendered("iron-copy-2.png") } }],
    }),
  );
  fs.writeFileSync(
    path.join(source, "recipes-shards", "shard-0000.json.gz"),
    gz({ recipes: [{ inputs: [{ kind: "item", id: "mod:iron", iconPath: rendered("iron-1.png") }], outputs: [] }] }),
  );
  return { dir, source, out: path.join(dir, "out") };
}

/** Stands in for cwebp: the raw pixels, so the test can read a cell back. */
async function rawEncode(pixels, width, height) {
  return Buffer.concat([Buffer.from(`${width}x${height};`), pixels]);
}

describe("build-icon-sheets", () => {
  it("packs deduplicated icons into sheets and points every reference at its cell", async () => {
    const { source, out } = fixture();
    const summary = await buildIconSheets({
      sourceDir: source,
      outDir: out,
      encode: rawEncode,
      order: [rendered("water-3.png")],
    });

    expect(summary).toMatchObject({ referencedIcons: 4, distinctIcons: 2, sheets: 1, missingIcons: 1, referencesDropped: 1 });
    const index = readGz(path.join(out, "resource-index.json.gz"));
    const [iron, water, aspect, gone] = index.resourceIndex;
    // The item list's order comes first: water takes the first cell.
    expect(water.iconAtlas).toMatchObject({ x: 0, y: 0, width: CELL, height: CELL, atlasWidth: 8 * CELL, atlasHeight: CELL });
    expect(iron.iconAtlas).toMatchObject({ x: CELL, y: 0 });
    expect(iron.iconPath).toBeUndefined();
    expect(iron.dominantColor).toBe("#ff0000");
    expect(index.machineHandlerIcons[0].resource.iconAtlas).toEqual(iron.iconAtlas);
    expect(aspect.iconPath).toBe("/nei/thaumcraft/aspects/aer.png");
    expect(gone.iconPath).toBeUndefined();
    expect(gone.iconAtlas).toBeUndefined();
    const shard = readGz(path.join(out, "recipes-shards", "shard-0000.json.gz"));
    expect(shard.recipes[0].inputs[0].iconAtlas).toEqual(iron.iconAtlas);

    const sheetName = path.basename(iron.iconAtlas.imagePath);
    expect(iron.iconAtlas.imagePath).toBe(`/datasets/gtnh/${V}/textures/sheets/${sheetName}`);
    expect(sheetName).toMatch(/^sheet-[0-9a-f]{16}\.webp$/);
    const bytes = fs.readFileSync(path.join(out, "textures", "sheets", sheetName));
    const pixels = bytes.subarray(bytes.indexOf(";") + 1);
    const at = (x, y) => [...pixels.subarray((y * 8 * CELL + x) * 4, (y * 8 * CELL + x) * 4 + 4)];
    expect(at(10, 10)).toEqual([0, 0, 255, 128]);
    expect(at(CELL + 10, 10)).toEqual([255, 0, 0, 255]);

    // The copy has no loose icons; the source is untouched.
    expect(fs.existsSync(path.join(out, "textures", "rendered"))).toBe(false);
    expect(readGz(path.join(source, "resource-index.json.gz")).resourceIndex[0].iconPath).toBe(rendered("iron-1.png"));
  });

  it("packs mod textures named by asset hint, read from the pack", async () => {
    const { source, out } = fixture();
    const indexFile = path.join(source, "resource-index.json.gz");
    const index = readGz(indexFile);
    index.resourceIndex.push({ kind: "aspect", id: "thaumcraft:aspect:radio", iconPath: "asset:gregtech:textures/aspects/RADIO.png" });
    fs.writeFileSync(indexFile, gz(index));
    const asked = [];
    const radio = icon([255, 255, 255, 255]);
    const summary = await buildIconSheets({
      sourceDir: source,
      outDir: out,
      encode: rawEncode,
      order: [],
      readAsset: (assetPath) => {
        asked.push(assetPath);
        return assetPath === "assets/gregtech/textures/aspects/RADIO.png" ? radio : undefined;
      },
    });
    expect(asked).toEqual(["assets/gregtech/textures/aspects/RADIO.png"]);
    expect(summary.distinctIcons).toBe(3);
    const aspect = readGz(path.join(out, "resource-index.json.gz")).resourceIndex.at(-1);
    expect(aspect.iconPath).toBeUndefined();
    expect(aspect.iconAtlas).toMatchObject({ width: CELL, height: CELL });
  });

  it("works in place, as the pipeline runs it, and drops the loose icons", async () => {
    const { source } = fixture();
    await buildIconSheets({ sourceDir: source, encode: rawEncode, order: [] });
    expect(fs.existsSync(path.join(source, "textures", "rendered"))).toBe(false);
    expect(readGz(path.join(source, "resource-index.json.gz")).resourceIndex[0].iconAtlas).toBeDefined();
  });
});

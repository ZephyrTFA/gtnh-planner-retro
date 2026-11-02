import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { buildBrowserIndexes, directionCountsOf } from "./build-browser-indexes.mjs";
import { encodeSearchTokens } from "../../../src/lib/search/text-index";

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const gz = (value) => zlib.gzipSync(JSON.stringify(value));
const readGz = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));

describe("build-browser-indexes", () => {
  it("sums made-by and used-by counts per resource across recipe maps", () => {
    expect(
      directionCountsOf([
        ["recipes:item:steel", [[0, [1, 2]], [3, [4]]]],
        ["uses:item:steel", [[1, [5]]]],
        ["uses:fluid:oxygen", [[2, [6, 7]]]],
      ]),
    ).toEqual([
      ["item:steel", 3, 1],
      ["fluid:oxygen", 0, 2],
    ]);
  });

  it("writes counts into the resource index and search words as numbers", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-indexes-"));
    dirs.push(dir);
    const source = path.join(dir, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "resource-index.json.gz"), gz({ datasetVersionId: "v", resourceIndex: [] }));
    fs.writeFileSync(
      path.join(source, "recipe-lookup-index.json.gz"),
      gz({ recipeCount: 2, searchText: ["Steel Ingot steel", "Iron Ingot"], entries: [["recipes:item:steel", [[0, [0]]]]] }),
    );
    const out = path.join(dir, "out");
    await buildBrowserIndexes({ sourceDir: source, outDir: out, encodeSearchTokens });

    expect(readGz(path.join(out, "resource-index.json.gz")).directionCounts).toEqual([["item:steel", 1, 0]]);
    const lookup = readGz(path.join(out, "recipe-lookup-index.json.gz"));
    expect(lookup.searchText).toBeUndefined();
    expect(lookup.searchTokens).toEqual(["steel", "ingot", "iron"]);
    expect(lookup.searchTokenIds).toEqual([[0, 1], [2, 1]]);
    // The source is read only.
    expect(readGz(path.join(source, "recipe-lookup-index.json.gz")).searchText).toHaveLength(2);
  });
});

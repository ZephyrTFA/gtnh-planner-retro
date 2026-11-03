import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeDatasetJson } from "./dataset-json-writer.mjs";
import { readResourceNames, translatedNames } from "./extract-locale-names.mjs";

const folders = [];
afterEach(() => {
  for (const dir of folders.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it("reads the resources array of a written dataset, line by line", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "locale-names-"));
  folders.push(dir);
  const file = path.join(dir, "recipes.json");
  await writeDatasetJson(file, {
    schemaVersion: 1,
    datasetVersionId: "stable-2.9.0",
    resources: [
      { id: "minecraft:iron_ingot", kind: "item", displayName: "Железный слиток" },
      { id: "fluid:water", kind: "fluid", displayName: "Вода, \"чистая\"" },
    ],
    recipes: [{ id: "r1", resources: [{ id: "decoy", displayName: "not a resource" }] }],
  });

  const names = await readResourceNames(file);
  expect([...names]).toEqual([
    ["minecraft:iron_ingot", "Железный слиток"],
    ["fluid:water", "Вода, \"чистая\""],
  ]);
});

it("keeps only names that differ from English and that the English dataset has", () => {
  const localized = new Map([
    ["minecraft:iron_ingot", "Железный слиток"],
    ["gregtech:proper_noun", "Volcanus"],
    ["addon:not_in_dataset", "Что-то"],
    // The planner's own composed names come out half-translated ("<species> Bee").
    ["factoryflow:bee_species:forestry-forest", "Лесная Bee"],
  ]);
  const english = new Map([
    ["minecraft:iron_ingot", "Iron Ingot"],
    ["gregtech:proper_noun", "Volcanus"],
    ["factoryflow:bee_species:forestry-forest", "Forest Bee"],
  ]);
  expect(translatedNames(localized, english)).toEqual({ "minecraft:iron_ingot": "Железный слиток" });
});

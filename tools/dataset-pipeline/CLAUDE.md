# Dataset pipeline (tools/dataset-pipeline)

A Forge mod (`gtnh-calc-oracle`) running inside a real GTNH 2.9 client exports every
recipe map, NEI layout, catalyst, multiblock config and rendered icon. Node scripts in
`scripts/` normalize that into the `RecipeDataset` the app reads:
`normalize-oracle-export.mjs`, `machine-configs.mjs`, `build-resource-index.mjs`,
`build-recipe-index.mjs` (recipe index, lookup index, 250-recipe shards).

## Rebuild and publish (by hand, in WSL)

The GitHub "GTNH dataset pipeline" workflow is a decoy (no runner). Never dispatch it.

1. `~/gtnh-factory-flow` in WSL Ubuntu is a git-less SNAPSHOT: copy changed pipeline
   scripts into it first or the rebuild runs old code.
2. Raw exports live at `~/gtnh-factory-flow/.pipeline/raw-export/<id>/oracle-export.json`
   with `rendered-icons/` beside them; reuse them while the pack version stands. Never
   export with `GTNH_RENDER_STACK_ICONS=false`: the export stamps icon filenames, and a
   run without them broke live search.
3. `~/run-both.sh` (fuller: `~/rebuild-cokeoven.sh`) normalizes, indexes and gzips into
   `~/gtnh-export/datasets/gtnh/<id>`. Only 2.9 is supported; 2.8.4 is retired.
4. `~/copy-datasets.sh` copies results into the Windows repo's `public/datasets/gtnh`.
5. Publish: scp the changed gzips, shards and oracle-report to the droplet's
   `/opt/shared/gtnh-datasets/<id>/` (stage first; move staging dirs out of the datasets
   root before `rebuild-manifest.mjs`), then `systemctl restart gtnh-flow`. Before the
   swap, compare icon counts and icon tables against live. Verify the live manifest and
   the published gzip afterwards.

Rebuilds must run `normalize-fluid-icon-alpha.mjs` (with `--rename`) after the index
builds and before publishing, or faint fluids ship invisible. Texture URLs are cache-immutable: fix pixels under a NEW filename (`--rename`),
and patch whole basenames only.

Icons ship as sprite sheets, not loose PNGs: `build-icon-sheets.mjs` runs after the fluid
repair, dedupes every referenced icon by pixels, downscales 256 -> 128 nearest-neighbour,
packs 64 per lossless WebP sheet (`textures/sheets/sheet-<hash>.webp`, item-list order
first) and rewrites every `iconPath` in the indexes and shards to an `iconAtlas` ref.
`textures/rendered` is not shipped. It needs `cwebp` (the image installs `webp`). Run it on
an existing dataset with `--out <dir>` to leave the source untouched.

A fresh export is NOT deterministic: crafting, furnace, bee, crop and essentia recipes
reorder, re-minting ~37,000 ids. When an export only ADDS fields, graft them onto the
published export (`~/graft-sparge.js`, matching recipes by content key) and confirm with
a shard diff (`~/cmp-field.js`). The 2.9 export in WSL is such a graft.

## Addon sets

`GTNH_ADDON_SET=<id> bash tools/dataset-pipeline/scripts/run-dataset-in-docker.sh stable`
exports the official pack plus the mods in `addons/<id>.json` as dataset
`<version id>-<id>` (for example `stable-2.9.0-tst`), beside the plain pack's.
`install-addon-mods.mjs` drops the jars into `mods/` after the pack unpacks, in both
export phases. Every jar is pinned by https URL and sha256, and a set names the GTNH
version it was built for: a changed upstream jar or a different pack stops the run.
Pin new versions by downloading the release asset and hashing it; never copy a hash
from anywhere else. Exam: `scripts/install-addon-mods.test.mjs`.

A set must load on the server AND the client: the client pass renders the icons, and
a client-only crash (a mixin into Angelica, NEI loading) shows up only there. List
every library the addon needs: read the `dependencies` string in its `@Mod` class
(`required-after:`), since READMEs miss them. Before a full run, start the prepared
client once with the set's jars and look for "Forge Mod Loader has successfully loaded".

The oracle reads every GregTech map from `RecipeMap.ALL_RECIPE_MAPS`, so addon maps
come through on their own. Recipes an addon shows only through its own NEI handler do
not; check a new addon's jar for `registerRecipeHandler` before trusting its coverage.
Addon multiblocks have no machine-table entries (`src/lib/machines/CLAUDE.md`).

The Docker runner caches the oracle jar in `.pipeline/oracle-build-cache`, keyed by a
hash of the oracle source, so a run needs GTNH's Maven only when the oracle changed.
The pack's server script restarts a crashed server forever; the runner treats a
restart before the export exists as a failure.

## Item names in other languages

`bash tools/dataset-pipeline/scripts/run-locale-names-in-docker.sh <ru_RU|zh_CN> [addon set]`
runs the client pass alone with `lang:<locale>` in options.txt (the pack ships its own
GregTech_<locale>.lang and config/txloader translations, so nothing else is fetched),
normalizes, and keeps the names that differ from English as
`<dataset>/locales/<locale>.json.gz` (`extract-locale-names.mjs`). The English dataset
must exist first; resource ids are registry-based, so they match. Names the planner
composes itself (`factoryflow:` bees, seeds, spawners) stay English. `rebuild-manifest.mjs`
lists each dataset's `locales`. A version's source details come from its
`.pipeline/<id>.pipeline.json`, not from version detection (which skips published packs).

## Import principles

- Prefer data exported from NEI or the runtime over hand-written tables and fallbacks.
- A missing recipe: check the raw oracle export first, then the mod source at the pack's
  exact GT tag.
- A map with one uncapped machine family carries no `machineHandlers` by design; a lone
  capped singleblock keeps its handler (below).
- Never parse tooltips globally. Multiblock stats come from tooltips only for catalysts
  flagged `multiblock` (`isMultiblockCatalyst` in `machine-configs.mjs`); singleblocks read
  only `Voltage IN` and `Machine Type`.
- Fold singleblock tier variants into one family (Liquefying Suckers are Fluid
  Extractors); multiblocks stay separate handlers (Large Fluid Extractor, Steam
  Separator). A map with one real family keeps the map name.
- Singleblock families: group voltage-input singleblocks by Java class plus their
  `Machine Type` tooltip (else recipe-map membership), named from the lowest tier. Keep a
  lone capped handler, or its `maximumTier` disappears. Exam:
  `scripts/singleblock-tiers.test.mjs`. A multiblock whose name collides with a
  singleblock gets its own id.
- Concrete items carry their oredict membership.
- What a slot accepts (`mAltFluidInputs`, `mOreDictAlt`) stays on that recipe's input. The
  catalog and the resource index carry only item-level alternatives: the server gives
  every slot without its own the index entry's. Exam: `build-resource-index.test.mjs`.
- NEI layout: keep exported slot positions and progress bars; empty slots stay visible;
  non-consumed slots stay visible except TGS tool placeholders; never replace a real slot
  with a fake label.
- Every fluid-touching Canner recipe is mirrored into the synthesized "Tank" map
  (`addTankRecipe`, 0 EU, 1 tick, real slots).
- Extreme Entity Crusher mobs come from the `kubatech-eec-mobs` oracle adapter (drop
  chances replayed in `eec-drops.mjs`). Sparge Tower rolled outputs and fusion startup EU
  are per-recipe export fields; `sparge-byproducts.mjs` appends rolled slots AFTER the
  exported ones so recipe ids stay stable.
- An item input's chance (`inputChance`, out of 10000) becomes `amount` x chance plus `consumeChance`; the recipe id
  hashes the whole stack, so it keeps the id an export without the chance gave it.
- Faint fluid icons: repair only captures under 20% mean opacity, starting from the
  original PNGs (`normalize-fluid-icon-alpha.mjs`).

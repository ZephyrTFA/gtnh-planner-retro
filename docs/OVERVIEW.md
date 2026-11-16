# Overview

How the whole planner fits together, for anyone arriving at the repo cold. Each area's own
rules are in the `CLAUDE.md` beside its code (the table in `AGENTS.md` points at them); this
document is the map those areas sit on, not the rules.

## The shape of it

One Next.js app in `output: "export"` mode (`next.config.ts`): `npm run build` writes a folder
of static files in `out/`, and there is no server. The only code that runs on a server is one
Cloudflare Worker for the request form (`worker/`, and only for `/api/*`). Everything else,
recipe search, the LP solve, wire routing, auto-arrange, runs in the visitor's browser, in four
esbuild-bundled Web Workers (`tools/build-workers.mjs`, started through `src/lib/worker-url.ts`):
`dataset`, `solve-books`, `grid-route`, `arrange`.

## Workflow 1: where the numbers come from (offline, about 30 min, Docker)

`tools/dataset-pipeline/` runs a Forge mod (`gtnh-calc-oracle`) inside a real headless GTNH 2.9
client. It reads every GregTech recipe map off `RecipeMap.ALL_RECIPE_MAPS`, plus NEI layouts,
catalysts, multiblock configs and rendered icons. Node scripts then normalize that into the
`RecipeDataset`: `normalize-oracle-export.mjs`, then `build-resource-index.mjs` and
`build-recipe-index.mjs` (250-recipe shards), then `normalize-fluid-icon-alpha.mjs`, then
`build-icon-sheets.mjs` (dedupe by pixels, 64 icons per lossless WebP sheet). Output lands in
`public/datasets/gtnh/` (gitignored; four dataset ids: the plain pack, `-tst`, `-gtnl`,
`-tst-gtnl`).

The load-bearing rule: no wiki data and no hand-written tables in the dataset. Tooltips are
scraped only for control definitions (which knobs exist, their icons, their tier lists), never
for coefficients. Addon sets pin every jar by URL and sha256; GTNL is mirrored on this repo
because it has no release built for 2.9.0.

## Workflow 2: dataset to a card's numbers

Recipe bytes are fetched by `dataset-engine/browser-source.ts` (gzip sniffing, the version's
checksum in the query string so shards cache for good) and searched by `dataset-engine/engine.ts`
in the `dataset` worker: set algebra over a precomputed lookup index. The worker heap is the
budget for new caches, about 300 MB after a first recipe search.

A recipe becomes a machine card through one chain: dataset, times curated table, times player
knobs.

1. `model/recipe-rules.ts` picks the handler and which knobs the machine exposes.
2. `machines/machine-table.ts` overrides the scraped numbers with behaviour transcribed from the
   mod's Java: speed, EU discount, parallels, overclock style, and where a machine states its own
   recipe (`runsGtFurnaceRecipe`) or refuses a build outright (`recipeGate`, on the hatches' own
   tier or the glass over them). It wins over scraped data;
   machines absent from it fall back to the dataset. `machine-table.test.ts` checks every entry
   against a fixture generated from ShadowTheAge's reference calculator and lists the deliberate
   divergences.
3. `solver/overclock.ts` spends the voltage. Parallels are paid for before overclocks; only
   leftover voltage buys steps. Recipes run in whole ticks; under one tick a multiblock banks the
   leftover speed as parallels and a singleblock wastes it.
4. `solver/hatch-input.ts` does the same job for multiblocks, which have no tier dial: they have
   hatches, in whole amps.

Coil and voltage questions land in this layer. A coil is a `machineConfigControls` entry, and
the coil's effect is a formula in that machine's table entry: no entry means no knob and no
bonus. The 2.9 tooltips scrape a knob only when the machine's own tooltip names it, so a machine
whose tooltip is silent (the Multi Smelter's coil, the Large Fluid Extractor's coil and glass)
gets its control from the table instead.

## Workflow 3: the solve

`store/solve-books.ts` is the store's only door to the solver, and it decides where to run it.
Small boards solve synchronously inside the state update. Past 120 nodes plus edges, after one
main-thread solve proved slower than 50 ms, or in Solve and Pool mode past 40, the plan goes to
the worker and the caller gets its previous books back flagged `stale`. Finished big books sit in
an 8-entry cache keyed on plan content minus `view`, so camera moves never invalidate a solve.

`calculateThroughput` (`solver/throughput.ts`) then runs one pipeline:

```text
expandSharedMachines -> expandPool (Pool) -> expandCrossFormEdges (cell <-> fluid, hidden free Tank)
   -> equilibrium.ts     iterative: the DIAGNOSIS (capability, clog names, "one wire fixes it")
   -> equations-core.ts  BUILD: the LP books, machine counts given
   -> solve-mode.ts      SOLVE and POOL: machine counts are the unknowns
   -> power-report.ts, balances, verdicts
```

The doctrine is one sentence: if it would fail in the game, it fails in the planner; otherwise
everything runs. Build answers "what does the board I built actually do" with a lexicographic
chain of locked stages: max total act, then max-min fairness over acts (the game's round-robin),
then recycle before import, then ship before banking, then min total flow for determinism. Solve
and Pool answer "what do I build for X/s" and drop fairness and equal-fill entirely. Two LP
engines behind one interface: HiGHS over WASM when loaded, else the homegrown simplex
(`solver/simplex.ts`). `solver-lab/simulate.ts` is the independent tick simulator, the "what the
game literally does" test oracle.

Three modes, two flags: Build (both off), Solve (`solveMode`), Pool (`solveMode` plus
`poolMode`). Pool is not a fourth UI: `pool/PoolWorksheet.tsx` covers the mounted canvas, so
positions, wires and camera survive, and it reuses the card's own controls rather than rebuilding
them. Pool works by injecting hidden drawers and wires before the solve, so the ordinary rules
apply unchanged.

## Workflow 4: the board

`components/flow/FactoryFlow.tsx` hosts React Flow; `flow/RecipeNode.tsx` is the machine card,
`StorageNode.tsx` the drawer, `BoardNode.tsx` and `PocketNode.tsx` an open or minimized board.

The performance contract is explicit, and it is a requirement, not an aspiration: routing depends
only on flow-space geometry, never on zoom, pan or the DOM; geometry is published by fingerprint
(`publishBoardGeometry`), not measured ad hoc; object identity is the cache currency; no
`querySelectorAll` or `getBoundingClientRect` per edge, node or frame; a hover re-renders one
wrapper. `BOARD_GRID = 20`, cards 19 cells wide, port rows 40px. The wire router
(`flow/grid-edge-router.ts`) is one deterministic 8-direction A* solve over every edge at once:
plan docks per card, thickest then longest first, keep the board with the fewest points, then rip
up and reroute crossings with escalating costs. Every tuning dial is in `flow/router-tuning.ts`.

The app shell is CSS-`zoom`ed by the interface scale setting, but the board unzooms itself and
carries the factor through its camera, because React Flow would otherwise measure cards and
pointer in two different pixel spaces (`src/components/CLAUDE.md`).

## Workflow 5: state and persistence

Two Zustand stores. `store/factory-store.ts` owns the project graph, `lastResult`, selection and
undo; nearly every edit calls `solveBooks(project)` inline. `store/design-store.ts` owns the
design library and the tabs, and IndexedDB is the plan of record (localStorage `project.v2` is
only a one-shot seed).

The part with real concurrency in it is two tabs sharing one library. Each tab remembers the
stored version its canvas came from, saves go through a compare-and-write in one IndexedDB
transaction, a background tab never echoes a recipe refresh back, and a stale tab holding its own
edits saves them as "name (conflict copy)" instead of losing anything. Every arriving plan
(import, paste, `#p=gtnh1.<deflate-raw base64url>` link, community copy) opens as a new design;
nothing overwrites the open one.

Supabase community features are dormant while `ONLINE_FEATURES` is false (`src/lib/site.ts`), so
accounts and posted setups are off; plans still share as links, which need nothing.

## Workflow 6: ship

`bash tools/deploy.sh` refuses a dirty tree or a HEAD that is not `origin/main`, then
`npm run build` (which requires `NEXT_PUBLIC_SITE_URL`), `tools/prune-static-export.mjs`,
`tools/security-headers.mjs`, and `wrangler deploy` of `out/` plus the Worker. `APP_VERSION` in
`src/lib/version.ts` bumps once per release, with one player-worded entry in
`src/lib/changelog.ts`.

CI (`.github/workflows/ci.yml`) is typecheck, the full vitest suite (about 210 test files, plus 9
`*.local.test.ts` scratch harnesses that only run under `vitest.local.config.ts`), and a
Chromium/Firefox icon-sizing check. No tolerated failures, and a test pins player-facing copy, so
a copy change commits with its test.

## The culture of the place

Three things to expect. Every number traces to a source of truth with a stated precedence: mod
Java, then exported NEI or runtime data, then the reference calculator, then tooltips, then the
wiki, and the tables say which they used. Verification is named: "Exams" for the tests that pin a
behaviour, "harnesses" for the `*.local.test.ts` rigs, a tick simulator as an oracle,
`tools/audit-board.mjs` printing wire crossings for router work. And a great many rules are
negative: don't auto-convert at a guessed 1000 L per cell, don't CSS-zoom the board, don't set
`fitView`, don't persist a setting with no visible control. Each one is the fossil of a bug.

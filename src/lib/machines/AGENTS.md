# Machine math (src/lib/machines)

Game source for checking mechanics: GT5-Unofficial and friends at `C:\Users\jack\gtnh-sources`;
the reference calculator (ShadowTheAge/gtnh, MIT) at `C:\Users\jack\gtnh-reference`.
Source beats the wiki, the workbook and the reference. Datasets pin a game version, so read
that version's own jars before public source: the client the dataset was built with sits in
`.pipeline/client-instance/<dataset>/pack/*/.minecraft/mods/` (GT++ ships inside the
`gregtech-*.jar`), and public master has moved on from what the dataset ships. Engine truth is
`OverclockCalculator`, `ParallelHelper`, `ProcessingLogic` and each MTE's
`createProcessingLogic`; GT++ `*Legacy` classes are fossils. Java `int *= float`
computes in float: replicate it.

## The machine table

- `machine-table.ts` holds curated behaviour (speed, EU discount, parallels, overclock
  style, extra `controls`), transcribed from the reference's `src/machines.ts`. It wins
  over scraped data; machines absent from it fall back to the dataset.
- Never add an entry by guessing. Their voltage tiers start at LV = 0 (ours at ULV = 0, so
  their `voltageTier + 1` is our ordinal), and their `speed` is throughput (ours is a
  duration multiplier, `1 / speed`). `machine-table.test.ts` checks every entry against
  `__fixtures__/reference-coefficients.json` and says how to regenerate it; run it.
- `ctx.tier(id)` is an option's position; `ctx.value(id)` is the number behind a count
  knob. Formulas that read a count must use `value`.
- A table machine that declares `speed` or `power` seeds from the recipe's base stats
  (`machineTableSeedsFromBase`): the pipeline bakes scraped multipliers into handler
  stats. Entries without them keep handler stats (the Electric Furnace family's are absolute).
  A machine whose handler carries no stats at all because the map exports none says so:
  `runsGtFurnaceRecipe` runs GT's fixed 128t / 4 EU smelt (the Multi Smelter), which is also
  what gives a 0 EU card its power report, hatch chip and voltage dial.
- For table machines, scraped tooltips supply only control DEFINITIONS (which knobs,
  icons, tier lists). Table-less machines still run on scraped effect values
  (`machine-effects.ts`); don't trust those when adding an entry. Where the reference
  punts, follow the mod source; deliberate divergences are listed in `machine-table.test.ts`.
- Still on scraped data on purpose: Nano Forge, PCB Factory, Component Assembly Line, QFT,
  Eye of Harmony (their coefficients read recipe metadata).

## Addon machines (Twist Space Technology)

- TST 0.8.0 entries sit in their own section of `machine-table.ts`, transcribed from the
  mod's classes and the defaults its `Config.java` ships (`github.com/Nxer/Twist-Space-
  Technology-Mod`, tag 0.8.0). `GTCM_MultiMachineBase` takes four knobs: getSpeedBonus()
  multiplies DURATION (the table's `speed` is its inverse), getEuModifier() is `power`,
  getMaxParallelRecipes() is `parallels`, isEnablePerfectOverclock() picks (4,4).
- Two power tiers: `voltageTier` is GT's getTier(getMaxInputVoltage()) (summed voltages);
  TST's getTotalPowerTier() reads `ctx.totalPowerEuT` (every hatch's V x A) rounded UP
  (`tstPowerTierCovering`); the Thermal Energy Devourer rounds it DOWN (`tstPowerTierWithin`).
- A machine's mode is its recipe map (`ctx.recipeMap`). A one-machine TST map runs on a
  placeholder named after the map, so the entry takes the map name as an alias, except
  where the map shares a GT machine's name (the fake cutting saw is "Cutting Machine").
- Left out on purpose (they stay "Unchecked"): generators, wireless-only paths
  (`ofNoOverclock` ignores speed and EU), execution cores, output multipliers, essentia
  and the steam pair (their GT++ steam billing is unverified). The Swelegfyr Blast
  Furnace has an entry since (GTNL section below). An entry with a wireless
  mode covers its hatch mode and says so in its note.
- `machineTableNameCollisions()` must stay empty: an alias must never take over a name.

## Addon machines (GT Not Leisure steam)

- The GTNL steam multiblocks sit in their own section of `machine-table.ts`, transcribed
  from SteamMultiMachineBase and its subclasses in the pinned dev-290 build (sources jar
  on the `mirror-gtnl-dev-290-*` release); the shared math is `gtnl-steam.ts`.
  `largeSteam(...)` is the common shape: per-build parallels, `super.getEUtDiscount() * f
  * tierMachine`, `super.getDurationModifier() / d / tierMachine`, getTierRecipes().
- Knobs: the build (STEAM_PRESSURE's id, so tierMachine = tier + 1) and the player's
  "Overclocking count" (recipeOcCount 0-4: x4 EU, /2 duration per step).
- `durationModifier` states Java's duration multiplier directly so truncation matches
  bit for bit. Below one tick `multiplierUnderOneTick` with zero overclocks counts the
  negative gaps as extra steps (0.3 ticks is 7 runs), capped at V x parallels / recipe
  EU/t. Steam bills min(parallels, runs): banked runs are free.
- Their own logic: the Large Steam Furnace (fixed 64-tick smelt, `steamPerTick`), the
  Steam Supercompressor (overclocks at EV on top of the count), the Steam Manufacturer
  (assembler recipes to MV, HV with an HV Assembler in the controller), the Infernal Coke
  Oven (speeds up to 10x as it runs), the Primitive Distillation Tower (`keepsOutput`:
  six layers, later fluids voided). Left out: the Large Steam Alloy Smelter (TST has one
  of the same name, and the TST + GTNL pack merges them).
- Maps one GTNL machine runs come without handlers, so the card would be a singleblock
  named after the map. `GTNL_MAP_MACHINES` (`gtnl-steam.ts`) names the real machine by
  the recipe's `metadata.recipeMapId`; the id decides because two maps share display
  names ("Rock Breaker" with GT's, "Hydraulic Manufacturing" between two machines).
- Steam detection is by name ("Steam ...", "High Pressure ..."); a steam machine named
  otherwise sets `burnsSteam` (Updraft Kiln, Infernal Coke Oven, the reactors, the tower).
- GTNL's Electric Industrial Blast Furnace is a heat machine whose +100 K per tier reads
  `getMaxInputEu()` (`heat.voltageBonusFromTotalPower`), not the summed voltage.

## Addon machines (GT Not Leisure coil machines)

- Most sit on `WirelessEnergyMultiMachineBase` (`gtnlWireless`: getMaxInputEu() at one amp,
  unlimited tier skips, (chip ? 0.4 : 0.6) - tier / 50 EU, 1 / (chip ? 10 : 5) x 0.75^tier
  duration, controller parallels x 16, a per-coil factor) or `GTMMultiMachineBase`
  (controller parallels, 0.8 / (1/1.67) bases). Wireless mode is left out and said so.
- Knobs: the Parallel Controller hatch (tier = mParallelTier, maxParallelAt), the Wireless
  Upgrade Chip, glass (`gtnlGlassTier`), controller items. GTNL hands getEUtDiscount() to
  the calculator only, so parallels pay the recipe's full EU (`parallelsPayFullEu`).
- Quirks kept on purpose: the Blaze Blast Furnace's 0.70 discount is tooltip only; an LV
  controller on the Mega Industrial Blast Furnace overflows to one parallel; the Mega
  Vacuum Drying Furnace's heat never reaches its calculator; the Large Pyrolysis Oven's
  and Industrial Alloy Blast Smelter's coils change nothing.
- GTNL's Chemical Plant shares GT++'s name and runs the LCR map: one entry, split on
  `recipeMap`. GTNL's Digester and Alloy Blast Smelter share GT's name AND map, so the
  dataset merges them and they keep GT's numbers. The fuel refining recipes' field-coil
  tier is not exported (notes on both machines).
- TST's Swelegfyr Blast Furnace is in: its drifting heat is a knob (coils or maximum).

## Overclocks and ticks (src/lib/solver/overclock.ts)

- Parallels are paid for with power BEFORE overclocks; only leftover voltage buys steps.
- Heat overclocks: only the `HEAT_OVERCLOCK` entries (EBF, Mega EBF, Volcanus, Exothermic
  Hearth, Zyngen, Utupu-Tanuri). A special value of 0 can be a real heat requirement
  (dehydrators).
- Recipes run in whole ticks. Over one tick GT truncates. Under one tick a multiblock
  banks leftover speed as parallels and a singleblock wastes it (`canSubTick`). A recipe
  with no handlers gets an invented `kind: "single"` placeholder, which is not evidence.
- `runtimeCalculation` in the dataset is `OverclockCalculator` alone (never saw
  `GTParallelHelper`), so it is not authoritative for multiblocks: `prefersCuratedMachineMath`.
- Singleblock tiers come from real catalysts (`availableTiers`). Never interpolate a
  machine that doesn't exist (Cold Trap has IV and ZPM, no LuV).

## Hatch power (src/lib/solver/hatch-input.ts)

- A fresh multiblock seeds the recipe's minimum tier and full-parallel supply in WHOLE amps.
  A tier change lifts a supply under 1A to 1A (`ampsForNewTier`).
- Switching single <-> multi keeps the voltage (`carryMachineVoltage`): single to multi is
  one 1A hatch at the single's tier, floored at the recipe's draw tier; never rerun the
  full-parallel seed on a switch (voltage-scaled parallels chase it up the tiers).

## Specific machines (most have a test named after them; the rest are in machine-table.test.ts)

- Fusion (`fusion.ts`): fixed reactor tier; 2/2 OCs on I-III, 4/4 on IV-V, capped by mark
  minus recipe tier; compact reactors run 64 parallels per mark above the recipe's startup
  band (strict `<` for bonuses, `<=` for tiers). Startup EU is the recipe's
  `metadata.fusionStartupEu` (from FUSION_THRESHOLD); `data/fusion-startups.json`
  fingerprints repair old exports (regenerate with `tools/audits/extract-fusion-startups.mjs`).
  The reactor is looked up by the name its recipe handler carries, so the table holds the
  names the game exports (`Fusion Control Computer Mk-I`, `FusionTech Mk-IV`, `Compact
  Fusion Computer Mk-I`); a spelling that is merely close leaves that reactor on ordinary
  voltage overclocks with no error. `fusion.test.ts` pins the ten names as the export
  gives them, never read back from the table. Never strip Roman numerals from fusion
  controller names.
- Extreme Entity Crusher (`extreme-entity-crusher.ts`): one recipe per mob, replayed from
  kubatech (kill ticks, its own perfect OC with 20-tick floor, infernals as expected value
  in float math, Well of Suffering, Looting, void). `fullPowerPool`. Mob swaps go through
  `swapMachineRecipe` in place; an EEC card never takes a second recipe.
- Dangote Distillus: Tower mode 12 parallels x3 speed; Distillery mode x2 speed, 15% EU,
  8 parallels per summed-voltage ordinal at max height. Selected by `source.recipeMap`.
- Precise Assembler (PrAss): normal Assembler handler x2 speed with unit-casing parallels;
  the dedicated precise map runs base speed, one parallel, casing minimum from special value.
- HILE (`hile.ts`): one `laserSource` voltage/amp choice; cube-root parallels; supplies no power.
- Neutron Activator (`neutron-activator.ts`): integer pipe height >= 4, 0.9f per extra
  layer, CEIL duration above one tick, FLOOR parallels below. Not the generic rule.
- Extreme Heat Exchanger: a fixed 20-tick cycle (`cycleTicks`) replaces the recipe's
  duration everywhere, search card included; its recipe amounts are per second. The
  dataset's 1 tick is Java's 0 clamped.
- Multi Smelter (`MTEMultiFurnace`), Large Fluid Extractor (`MTELargeFluidExtractor`) and
  Large Thermal Refinery (`MTEIndustrialThermalCentrifuge`): all need knobs the 2.9
  tooltips never mention, so the table carries them. The
  smelter runs GT's fixed furnace recipe (`runsGtFurnaceRecipe`) and doubles parallels per
  coil tier; the extractor's coil is speed and EU, its glass must reach the hatches' own
  tier (`glassTier`, `ctx.hatchTier`), and its glass defaults to the top rung so a plan
  saved before the knob exists keeps running; the refinery's coil is speed and EU and its
  solenoids (`solenoidCoil`, MV to UMV, the same ladder the extractor's scraped knob uses)
  are 2 parallels per solenoid voltage tier.
- Utupu-Tanuri is both `Multiblock Dehydrator` and `Vacuum Furnace`; keep both aliases on
  one entry (`minimumHeatFromSpecialValue`).
- Naquadah Fuel Refinery: special value = minimum coil tier (`minimumFromSpecialValue`).
- GT++ Chemical Plant catalysts (`chemical-plant.ts`, MTEChemicalPlant#damageCatalyst): each
  parallel wears 1 of 50 uses with chance 1.2f - 0.2 x pipe tier (Bronze 1); the break returns
  a Catalyst Carrier and skips the run's remaining parallels, so the rate is a renewal average
  over whole runs, not chance / 50. Awakened Draconium coils + Tungstensteel pipes stop it.
  Applied per card in `applyRecipeInputOverrides`; GTNL's Rockefeller (same map) never wears.
- Pipe casings are two families: `pipeCasing` (FLUID, Bronze-Tungstensteel: Chemical
  Plant, Multi Autoclave) and `itemPipeCasing` (ITEM, Tin-Black Plutonium: lathe, mixer,
  wire factory, dissection, Amazon depot, which hide the fluid knob via `hidesControls`).
  The Industrial Autoclave takes both (fluid pipe = EU discount, item pipe = parallels).
- Coke Oven alias matches the brick oven too: no `cokeOvenSlices` control means no
  overclocks and one parallel.
- Steam: the 8 steam multis are table entries (8 parallels, no OC, shared pressure
  control); steam singleblocks are synthesized in `src/lib/model/recipe-rules.ts`. EU stays
  zero on steam cards; litres are billed instead, never both. A steam multiblock's `power`
  is what the litres bill from; the recipe's own EU is `machineProfile.steamEut`
  (`ctx.recipeEuT`), and a recipe over V[getTierRecipes()] is refused (`steamVoltageGate`:
  LV on GT's steam multis).
- Crafting maps run on GT++'s Auto Workbench (synthesized in `recipe-rules.ts`, flat 2048 EU
  per craft) with instant hand-craft as the second handler.
- Tree Growth Simulator (`tree-growth-simulator.ts`, MTETreeFarm): a fixed 100-tick run at
  VP[t] whatever the voltage (`getOverclockedRecipeStats` replays it; the reported tier is the
  game's t, V x A rounded up); out = NEI amount x (2t^2 - 2t + 5) x the mode's tool; no tool, no
  output. Forestry saplings scale by height/girth, fertility and yield in Java float maths. The
  dataset has no sapling, modes or genes: `data/tgs-trees.json` (matched by outputs, then ids).
  Tool controls keep the old dataset's ids (`tgsLogTool`...). Its NEI page says ULV and 0 EU/t;
  the card treats it as LV and VP[1] (`applyMachineHandlerToRecipe`, `enrichPassiveProductionRecipe`).
- Bacterial Vat (`bacterial-vat.ts`, MTEBioVat): normal overclocks; the first fluid in and out
  x M from the output hatch's fill (2..1001, 1 empty or ME), applied to inputs in
  `applyRecipeInputOverrides` and to outputs in `getMachineOutputMultiplier`; a run must fit
  (void protection holds it). Glass and sieverts gate via `recipeGate` (`MachineContext.recipe`);
  the radio hatch's material is an input at its decay rate. The dataset has no GLASS/SIEVERT:
  `data/bio-vat.json` and `data/radio-hatch.json`.
- Both come from the in-game mod's export (`call 'machinedata?dir=...'` in the full pack, then
  `tools/audits/import-machine-side-data.mjs`); never hand-edit them. Their cards show their
  working (`formula-lines.ts`, `MachineFormulas`); the in-game mod shows the same lines.
  Per-recipe knobs come from `controlsFor` in the machine table.

## Config controls

- Controls are structured data (`machineConfigControls`), never frontend special cases.
  Several dimensions stack on one node (coil + pipe casing). Prefer `machineConfigTiers`;
  keep legacy `coilTier` loading.
- Disable tier controls a handler ignores. Manual/instant crafting tables are not timed
  machines; with no duration they are instant, never a fake `0 EU / 1s`.
- Keep knob captions short (`CAPTIONS` in `SettingTile.tsx`); tiles are 96px minimum and
  truncate.
- A recipe's special value means different things per map; never read it as heat
  globally. Multiblock-ness comes from the exported `multiblock` flag, the source class or
  a "Controller Block" tooltip line (`machine-configs.mjs`), never from the map.
- Exotic (multi-amp, laser) hatches: one per machine, and their amps never raise the
  parallel ordinal.
- Chanced inputs (GT's mInputChances; in 2.9 only the Boldarnator's leaves, 10%): `amount` is the average a run and
  `consumeChance` marks it so it applies once (`model/input-chance.ts`, which also repairs exports and plans without it).
- Crops (CropsNH): chance is display-only, already baked into the amount. The wiki's
  Industrial Farm table is wrong; the mod source is right.

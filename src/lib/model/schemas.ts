import { z } from "zod";
import { PROJECT_SCHEMA_VERSION } from "./types";

export const resourceKindSchema = z.enum(["item", "fluid", "aspect", "power"]);

/**
 * Plan size limits. A plan is data from anyone (a link, a paste, a file), and
 * a crafted one with thousands of cards froze the page; every list is bounded,
 * far above the biggest real plans (tens of cards).
 */
export const PLAN_LIMITS = {
  cards: 2000,
  recipes: 2000,
  edges: 8000,
  annotations: 1000,
  pockets: 500,
  productionGroups: 500,
  fuelProfiles: 200,
  waypoints: 256,
  slots: 128,
  alternatives: 512,
  tooltipLines: 64,
  extraRecipes: 64,
  longText: 100_000,
  shortText: 1000,
} as const;

/**
 * Where plan art may come from: this site's own files. A plan naming any other
 * address would have the browser fetch it (and tell that host who opened the
 * plan), so anything else is dropped on load, not rejected: the resource's art
 * comes back from the dataset by its kind and id.
 */
const SITE_ASSET_PATH = /^\/(datasets|nei|power-art|mode-art)\/[A-Za-z0-9._~%@+\-/]*$/;
export const siteAssetPathSchema = z
  .string()
  .max(500)
  .regex(SITE_ASSET_PATH)
  .refine((path) => !path.includes("..") && !path.includes("//"));
/** An optional site path that is dropped, not fatal, when it is anything else. */
const optionalSitePath = siteAssetPathSchema.optional().catch(undefined);

export const resourceIconAtlasRefSchema = z.object({
  imagePath: siteAssetPathSchema,
  atlasWidth: z.number().int().positive(),
  atlasHeight: z.number().int().positive(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dominantColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
const optionalIconAtlas = resourceIconAtlasRefSchema.optional().catch(undefined);

/**
 * A plan's (or post's) one-item face. Deliberately lenient: it only ever
 * renders as an icon, and a strict field must never sink a whole plan load.
 */
export const entryIconSchema = z.object({
  kind: z.enum(["item", "fluid"]),
  resourceId: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  iconPath: optionalSitePath,
  iconAtlas: optionalIconAtlas,
  dominantColor: z.string().max(32).optional(),
});

export const dominantColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .optional();
export const factoryNodeColorTagSchema = z.enum([
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black",
  // The system swatches: the app's own semantic inks and card greys.
  "scarlet",
  "amber",
  "emerald",
  "azure",
  "steel",
  "onyx",
]);

export const resourceAmountSchema = z.object({
  kind: resourceKindSchema,
  id: z.string().min(1, "Resource id is required"),
  amount: z.number().positive("Amount must be greater than zero"),
  displayName: z.string().min(1).optional(),
  iconPath: optionalSitePath,
  iconAtlas: optionalIconAtlas,
  dominantColor: dominantColorSchema,
  modId: z.string().min(1).optional(),
  tooltip: z.array(z.string().max(PLAN_LIMITS.shortText)).max(PLAN_LIMITS.tooltipLines).optional(),
  neiSlot: z
    .object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
    })
    .optional(),
  alternatives: z
    .array(
      z.object({
        kind: resourceKindSchema,
        id: z.string().min(1),
        displayName: z.string().min(1).optional(),
        iconPath: optionalSitePath,
        iconAtlas: optionalIconAtlas,
        dominantColor: dominantColorSchema,
        modId: z.string().min(1).optional(),
        tooltip: z.array(z.string().max(PLAN_LIMITS.shortText)).max(PLAN_LIMITS.tooltipLines).optional(),
        amount: z.number().positive().optional(),
      }),
    )
    .max(PLAN_LIMITS.alternatives)
    .optional(),
});

export const recipeInputSchema = resourceAmountSchema.extend({
  optional: z.boolean().optional(),
  consumed: z.boolean().optional(),
  consumeChance: z.number().min(0).max(1).optional(),
});

export const recipeOutputSchema = resourceAmountSchema.extend({
  chance: z.number().min(0).max(1).optional(),
  byproduct: z.boolean().optional(),
});

export const runtimeCalculationResourceSchema = z.object({
  kind: resourceKindSchema,
  id: z.string().min(1),
  amount: z.number().positive(),
  chance: z.number().min(0).max(1).optional(),
});

export const runtimeCalculationVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  machineHandlerId: z.string().min(1).optional(),
  overclockTier: z.string().min(1).optional(),
  coilTier: z.string().min(1).optional(),
  machineConfigTiers: z.record(z.string().min(1), z.string().min(1)).optional(),
  durationTicks: z.number().int().positive("Duration must be at least 1 tick"),
  eut: z.number().min(0, "EU/t must be zero or positive"),
  parallel: z.number().positive().optional(),
  inputs: z.array(runtimeCalculationResourceSchema).optional(),
  outputs: z.array(runtimeCalculationResourceSchema).optional(),
  notes: z.string().optional(),
});

export const runtimeCalculationSchema = z.object({
  sourceKind: z.enum([
    "gregtech-processing-logic",
    "gregtech-overclock-calculator",
    "gregtech-recipe-baseline",
    "thaumcraft-runtime",
    "passive-bee",
    "passive-crop",
    "synthetic-passive-bootstrap",
  ]),
  sourceClass: z.string().min(1).optional(),
  sourceVersion: z.string().min(1).optional(),
  recipeMap: z.string().min(1).optional(),
  status: z.enum(["computed", "partial", "missing"]),
  oracleEligible: z.boolean(),
  strict: z.boolean().optional(),
  generatedAt: z.string().optional(),
  variants: z.array(runtimeCalculationVariantSchema),
  warnings: z.array(z.string()).optional(),
});

export const machineProfileSchema = z.object({
  machineType: z.string().min(1),
  minimumTier: z.string().min(1),
  maximumTier: z.string().min(1).optional(),
  availableTiers: z.array(z.string().min(1)).optional(),
  durationTicks: z.number().int().positive("Duration must be at least 1 tick").optional(),
  eut: z.number().min(0, "EU/t must be zero or positive").optional(),
  maxParallel: z.number().positive().optional(),
  eutLimit: z.number().positive().optional(),
  perfectOverclock: z.boolean().optional(),
  notes: z.string().optional(),
});

export const machineConfigControlSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  minimumKey: z.string().min(1),
  defaultKey: z.string().min(1).optional(),
  numeric: z
    .object({
      min: z.number(),
      max: z.number().optional(),
      step: z.number().positive().optional(),
    })
    .optional(),
  minimumHeatFromSpecialValue: z.boolean().optional(),
  tiers: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        heat: z.number().int().positive().optional(),
        durationMultiplier: z.number().positive().optional(),
        eutMultiplier: z.number().positive().optional(),
        outputMultiplier: z.number().nonnegative().optional(),
        parallelMultiplier: z.number().positive().optional(),
        parallelPerVoltageTier: z.number().positive().optional(),
        parallelVoltageBase: z.number().nonnegative().optional(),
        resource: resourceAmountSchema,
      }),
    )
    .min(1),
});

export const machineHandlerSchema = machineProfileSchema.extend({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["single", "multiblock", "crafting", "automation"]).optional(),
  machineConfigControls: z.array(machineConfigControlSchema).optional(),
});

export const recipeSchema = z.object({
  id: z.string().min(1, "Recipe id is required"),
  name: z.string().min(1, "Recipe name is required"),
  kind: z
    .enum([
      "gregtech_machine",
      "bee_produce",
      "crop_produce",
      "ore_vein",
      "small_ore",
      "underground_fluid",
      "essentia_smelting",
      "custom",
      "unknown",
    ])
    .optional(),
  category: z.string().min(1).optional(),
  machineType: z.string().min(1, "Machine type is required"),
  minimumTier: z.string().min(1, "Minimum tier is required"),
  maximumTier: z.string().min(1).optional(),
  availableTiers: z.array(z.string().min(1)).optional(),
  durationTicks: z.number().int().positive("Duration must be at least 1 tick"),
  eut: z.number().min(0, "EU/t must be zero or positive"),
  inputs: z.array(recipeInputSchema).max(PLAN_LIMITS.slots),
  // Zero outputs is legal: the crop-farm placeholder recipe
  // (factoryflow:crop-farm:empty) has none until a crop is picked, and it
  // stays in project.recipes.
  outputs: z.array(recipeOutputSchema).max(PLAN_LIMITS.slots),
  programmedCircuit: z.string().optional(),
  specialValue: z.number().optional(),
  notes: z.string().optional(),
  machineProfile: machineProfileSchema.optional(),
  machineHandlers: z.array(machineHandlerSchema).optional(),
  machineConfigControls: z.array(machineConfigControlSchema).optional(),
  // Power cards (src/lib/power): the generator behind a synthesized recipe.
  power: z
    .object({
      sourceId: z.string().min(1),
      euPerTick: z.number(),
      stats: z.array(z.object({ label: z.string(), value: z.string() })),
      warnings: z.array(z.string()).optional(),
    })
    .optional(),
  runtimeCalculation: runtimeCalculationSchema.optional(),
  isDemo: z.boolean().optional(),
  source: z
    .object({
      datasetVersionId: z.string().optional(),
      recipeMap: z.string().optional(),
      sourceMod: z.string().optional(),
      exporter: z.enum(["nesql", "recex", "nerd", "gtnh-oracle", "unknown"]).optional(),
      rawRecipeId: z.string().optional(),
      sourceIdentifier: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.string().min(1), z.unknown()).optional(),
  nei: z
    .object({
      iconPath: optionalSitePath,
      source: z.string().optional(),
      handlerClass: z.string().optional(),
      canvas: z.object({ width: z.number(), height: z.number() }).optional(),
      backgroundImage: optionalSitePath,
      itemInputGrid: z.object({ width: z.number(), height: z.number() }).optional(),
      itemOutputGrid: z.object({ width: z.number(), height: z.number() }).optional(),
      fluidInputGrid: z.object({ width: z.number(), height: z.number() }).optional(),
      fluidOutputGrid: z.object({ width: z.number(), height: z.number() }).optional(),
      slotCapacity: z
        .object({
          maxItemInputs: z.number().int().min(0).optional(),
          maxItemOutputs: z.number().int().min(0).optional(),
          maxFluidInputs: z.number().int().min(0).optional(),
          maxFluidOutputs: z.number().int().min(0).optional(),
        })
        .optional(),
      slots: z
        .array(
          z.object({
            side: z.enum(["input", "output"]),
            kind: resourceKindSchema,
            slotIndex: z.number().int().min(0),
            x: z.number().int().min(0),
            y: z.number().int().min(0),
          }),
        )
        .optional(),
      progressBars: z
        .array(
          z.object({
            x: z.number().int().min(0),
            y: z.number().int().min(0),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            direction: z.enum(["right", "up", "circular"]),
            texture: optionalSitePath,
          }),
        )
        .optional(),
      additionalInfo: z.array(z.string()).optional(),
      requiresCleanroom: z.boolean().optional(),
      requiresLowGravity: z.boolean().optional(),
    })
    .optional(),
});

export const targetRateSchema = z.object({
  kind: resourceKindSchema,
  resourceId: z.string().min(1),
  amountPerSecond: z.number().positive("Target rate must be greater than zero"),
  displayName: z.string().optional(),
});

export const factoryNodeSchema = z.object({
  productionGroupId: z.string().min(1).optional(),
  id: z.string().min(1),
  recipeId: z.string().min(1),
  colorTag: factoryNodeColorTagSchema.optional(),
  customRate: z
    .object({
      perSecond: z.number().min(0),
      mode: z.enum(["supply", "request"]),
    })
    .optional(),
  cropFullFarmCount: z.number().int().min(1).optional(),
  machineCount: z.number().min(0),
  parallel: z
    .number()
    .positive()
    .transform((value) => Math.max(1, Math.round(value))),
  overclockTier: z.string().min(1),
  energyHatches: z
    .number()
    .int()
    .min(1)
    .max(64)
    .optional(),
  energyHatchType: z.string().min(1).optional(),
  powerEuT: z.number().nonnegative().finite().optional(),
  hatchVoltageTier: z
    .enum([
      "ULV",
      "LV",
      "MV",
      "HV",
      "EV",
      "IV",
      "LuV",
      "ZPM",
      "UV",
      "UHV",
      "UEV",
      "UIV",
      "UMV",
      "UXV",
      "MAX",
    ])
    .optional(),
  hatchAmps: z.number().nonnegative().finite().optional(),
  powerInputMode: z.enum(["amps", "eut"]).optional(),
  machineHandlerId: z.string().min(1).optional(),
  coilTier: z.string().min(1).optional(),
  machineConfigTiers: z.record(z.string().min(1), z.string().min(1)).optional(),
  settingsCollapsed: z.boolean().optional(),
  hatchSupplies: z.array(z.enum(["water", "air"])).optional(),
  recipeInputOverrides: z.record(z.string().min(1), recipeInputSchema).optional(),
  // More recipes the same machine runs (shared-machine.ts), sections 1..n.
  extraRecipes: z
    .array(
      z.object({
        recipeId: z.string().min(1),
        recipeInputOverrides: z.record(z.string().min(1), recipeInputSchema).optional(),
      }),
    )
    .max(PLAN_LIMITS.extraRecipes)
    .optional(),
  // Solve mode's pin: run exactly this many machines; absent = solver's choice.
  solvePin: z.number().nonnegative().optional(),
  targetOutput: targetRateSchema.optional(),
  enabled: z.boolean(),
  pocketId: z.string().min(1).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

export const factoryStorageSchema = z.object({
  productionGroupId: z.string().min(1).optional(),
  id: z.string().min(1),
  kind: resourceKindSchema,
  resourceId: z.string().min(1),
  colorTag: factoryNodeColorTagSchema.optional(),
  displayName: z.string().max(PLAN_LIMITS.shortText).optional(),
  iconPath: optionalSitePath,
  iconAtlas: optionalIconAtlas,
  dominantColor: dominantColorSchema,
  capacity: z.number().positive().optional(),
  // Absent means `product` (the pulling one), as on legacy plans.
  drainMode: z.enum(["product", "byproduct", "trash"]).optional(),
  // Absent means `overflow` in Build and `strict` in Solve (effectiveBufferMode).
  bufferMode: z.enum(["overflow", "strict", "ratio"]).optional(),
  ratioExportPercent: z.number().min(0).max(100).optional(),
  // Pool mode: which side of the shared pool an unwired drawer sits on.
  poolSide: z.enum(["source", "drain"]).optional(),
  // Solve mode's requirement on a product drawer; absent = unconstrained.
  targetPerSecond: z.number().finite().optional(),
  targetMode: z.enum(["at-least", "at-most", "exact", "ignore"]).optional(),
  poolTargetMode: z.enum(["at-least", "exact", "ignore"]).optional(),
  pocketId: z.string().min(1).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

export const factoryAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["box", "arrow", "text", "zone", "image"]),
  colorTag: factoryNodeColorTagSchema.optional(),
  text: z.string().max(PLAN_LIMITS.longText).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  size: z.object({
    width: z.number(),
    height: z.number(),
  }),
  arrowDirection: z.enum(["down-right", "down-left", "up-right", "up-left"]).optional(),
  // Zone outlines: bounded so an imported plan cannot carry a pathological
  // vertex soup; a drawn zone simplifies to a handful of corners.
  points: z.array(z.object({ x: z.number(), y: z.number() })).max(64).optional(),
  // Bounded so an imported plan cannot carry a note that swallows the board.
  fontSize: z.number().min(8).max(96).optional(),
  // Image annotations: only ever rendered as an <img> src. A picture carried
  // in the plan itself (a data URI) only: there is no image server, and a URL
  // would have the browser call whatever host the plan names. Anything else
  // is dropped, and the note stays.
  imageUrl: z
    .string()
    .max(4_000_000)
    .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/)
    .optional()
    .catch(undefined),
  style: z
    .object({
      border: z.enum(["solid", "dashed", "none"]).optional(),
      borderColor: factoryNodeColorTagSchema.optional(),
      fill: z
        .enum(["tint", "solid", "paper", "dots", "grid", "graph", "ruled", "hatch", "none"])
        .optional(),
      fillColor: factoryNodeColorTagSchema.optional(),
      // A canvas theme id; unknown ids quietly fall back at render time.
      fillTheme: z.string().max(32).optional(),
      marks: z.enum(["none", "dots", "grid", "graph", "ruled", "hatch"]).optional(),
    })
    .optional(),
  pocketId: z.string().min(1).optional(),
});

export const factoryPocketSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  colorTag: factoryNodeColorTagSchema.optional(),
  parentPocketId: z.string().min(1).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  // Standing open as a board window; absent = minimized summary card.
  expanded: z.boolean().optional(),
  size: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  // A canvas theme id; unknown ids quietly fall back at render time.
  theme: z.string().max(32).optional(),
  // A canvas pattern id; unknown ids fall back to the default ruling.
  pattern: z.string().max(16).optional(),
});

export const factoryEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  resourceKind: resourceKindSchema,
  resourceId: z.string().min(1),
  label: z.string().optional(),
  ratePerSecond: z.number().positive().optional(),
  ratioWeight: z.number().nonnegative().optional(),
  ratioInputWeight: z.number().nonnegative().optional(),
  waypoints: z.array(z.object({ x: z.number(), y: z.number() })).max(PLAN_LIMITS.waypoints).optional(),
  // A loose cell wire's Canner ratio; see FactoryEdge.crossForm.
  crossForm: z.object({ litresPerCell: z.number().positive() }).optional(),
});

export const fuelProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    fuelFluidId: z.string().min(1),
    euPerLiter: z.number().positive().optional(),
    euPerBucket: z.number().positive().optional(),
    isDemo: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .refine((fuel) => fuel.euPerLiter !== undefined || fuel.euPerBucket !== undefined, {
    message: "Fuel profile needs euPerLiter or euPerBucket",
    path: ["euPerLiter"],
  });

/**
 * The author's workspace arrangement, carried by shared setups only.
 *
 * Every field is optional and loosely typed on purpose: it must survive
 * `factoryProjectSchema.parse` (which strips unknown keys) and server
 * re-validation, and a plan from a newer build must not be rejected over a
 * view setting this one does not know. Unknown values are dropped when the
 * view is APPLIED, where the real constants live.
 */
export const planViewStateSchema = z.object({
  canvasPattern: z.string().optional(),
  canvasTheme: z.string().optional(),
  lineHeatMode: z.boolean().optional(),
  fixedEdgeWidth: z.boolean().optional(),
  linePulseMode: z.boolean().optional(),
  calmMode: z.boolean().optional(),
  glanceMode: z.string().optional(),
  rateUnit: z.enum(["tick", "second", "minute", "hour", "eu"]).optional(),
  leftPanelOpen: z.boolean().optional(),
  rightPanelOpen: z.boolean().optional(),
  showHiddenResources: z.boolean().optional(),
  favouritesOnly: z.boolean().optional(),
  trendsOpen: z.boolean().optional(),
  hiddenResourceKeys: z.array(z.string()).optional(),
  favouriteResourceKeys: z.array(z.string()).optional(),
});

export const factoryProjectSchema = z.object({
  productionGroups: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), parentId: z.string().min(1).optional(),
    resourceRules: z.record(z.string(), z.enum(["share", "import"])).optional(),
  })).max(PLAN_LIMITS.productionGroups).optional(),
  poolResourceRules: z.record(z.string(), z.enum(["share", "import"])).optional(),
  checklist: z
    .object({
      cards: z.array(z.string()).max(PLAN_LIMITS.cards * 2),
      edges: z.array(z.string()).max(PLAN_LIMITS.edges),
    })
    .optional(),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1).max(PLAN_LIMITS.shortText),
  name: z.string().min(1).max(PLAN_LIMITS.shortText),
  // Far above any blurb, so it never sinks a real plan load.
  description: z.string().max(PLAN_LIMITS.longText).optional(),
  icon: entryIconSchema.optional(),
  view: planViewStateSchema.optional(),
  targetRate: targetRateSchema.optional(),
  // Legacy setup rules: still parsed so old JSON validates, dropped on load.
  setupRules: z
    .object({
      freeInputs: z.boolean().optional(),
      freeOutputs: z.boolean().optional(),
      looseCellWires: z.boolean().optional(),
    })
    .optional(),
  // Legacy sketch mode, dropped on load.
  assumeBoundaries: z.boolean().optional(),
  // Solve mode: product amounts are the question, machine counts the answer.
  solveMode: z.boolean().optional(),
  // Pool mode: every resource is shared, no wires needed.
  poolMode: z.boolean().optional(),
  // Pool mode's cell-to-fluid ratios, litres per filled cell by cell id.
  poolCellRatios: z.record(z.string(), z.number().positive()).optional(),
  recipes: z.array(recipeSchema).max(PLAN_LIMITS.recipes),
  nodes: z.array(factoryNodeSchema).max(PLAN_LIMITS.cards),
  storages: z.array(factoryStorageSchema).max(PLAN_LIMITS.cards).optional().default([]),
  annotations: z.array(factoryAnnotationSchema).max(PLAN_LIMITS.annotations).optional().default([]),
  pockets: z.array(factoryPocketSchema).max(PLAN_LIMITS.pockets).optional().default([]),
  edges: z.array(factoryEdgeSchema).max(PLAN_LIMITS.edges),
  fuelProfiles: z.array(fuelProfileSchema).max(PLAN_LIMITS.fuelProfiles),
  selectedFuelProfileId: z.string().optional(),
  notes: z.string().max(PLAN_LIMITS.longText).optional(),
  metadata: z
    .object({
      isDemo: z.boolean().optional(),
      source: z.string().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      communityPlanId: z.string().optional(),
    })
    .optional(),
});

/**
 * A captured board selection (the clipboard/blueprint payload): validated
 * server-side before a blueprint is stored, so a hand-crafted upload cannot
 * smuggle malformed cards into every design that later pastes it.
 */
export const boardSelectionPayloadSchema = z.object({
  productionGroups: factoryProjectSchema.shape.productionGroups,
  nodes: z.array(factoryNodeSchema),
  storages: z.array(factoryStorageSchema),
  annotations: z.array(factoryAnnotationSchema),
  pockets: z.array(factoryPocketSchema),
  edges: z.array(factoryEdgeSchema),
  recipes: z.array(recipeSchema),
});

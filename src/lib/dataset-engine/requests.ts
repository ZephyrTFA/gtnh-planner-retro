import type { MachineTier, ResourceKind } from "@/lib/model/types";
import {
  MAX_RECIPE_QUERY_CLAUSES,
  parseRecipeQueryClause,
  type RecipeQueryClause,
  type RecipeQuerySideOp,
} from "@/lib/datasets/recipe-query";
import {
  getDatasetCatalog,
  getDatasetRecipe,
  getDatasetRecipeIds,
  getDatasetResourceArt,
  listDatasetCropFarmRecipes,
  listDatasetEecMobs,
  prewarmDatasetVersion,
  queryDatasetRecipes,
  queryDatasetResources,
  resolveDatasetRecipeRefs,
  type DatasetRecipeRef,
} from "./engine";

/**
 * The dataset API, answered without a server: the same paths, parameters and
 * JSON the `/api/datasets/*` routes served, so the client builds its requests
 * as before and the browser's dataset worker answers them. Parameter parsing
 * is the routes', rule for rule.
 */
export interface DatasetApiRequest {
  /** `/api/datasets/<versionId>/<endpoint>[/<recipeId>]` */
  pathname: string;
  /** The query string, without the `?`. */
  search: string;
  /** A POST body, parsed. */
  body?: unknown;
}

export type DatasetApiResponse = { ok: true; status: 200; json: unknown } | { ok: false; status: number; error: string };

type TierFilter = "all" | Exclude<MachineTier, "DEMO">;
const RECIPE_RESOURCE_KINDS = new Set<ResourceKind>(["item", "fluid", "aspect"]);

export async function answerDatasetApi(request: DatasetApiRequest): Promise<DatasetApiResponse> {
  const match = /^\/api\/datasets\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/.exec(request.pathname);
  if (!match) {
    return { ok: false, status: 404, error: "Not found." };
  }
  const versionId = decodeURIComponent(match[1]!);
  const endpoint = match[2]!;
  const tail = match[3] === undefined ? undefined : decodeURIComponent(match[3]);
  const params = new URLSearchParams(request.search);
  if (endpoint !== "catalog") {
    // The page's first questions (the item list) are answered first; the
    // recipe side's download and index build follow, in a later task.
    schedulePrewarm(versionId, PREWARM_AFTER_REQUEST_MS);
  }

  try {
    switch (endpoint) {
      case "catalog": {
        const catalog = await getDatasetCatalog(versionId);
        // If nothing else is asked for soon, warm up anyway.
        schedulePrewarm(versionId, PREWARM_IDLE_MS);
        return ok(catalog);
      }
      case "recipes": {
        if (tail !== undefined) {
          const recipe = await getDatasetRecipe(versionId, tail);
          return recipe ? ok(recipe) : { ok: false, status: 404, error: "Recipe not found." };
        }
        return ok(await queryDatasetRecipes(versionId, parseRecipeQuery(params)));
      }
      case "recipe-ids":
        return ok({ recipeIds: await getDatasetRecipeIds(versionId) });
      case "resolve-recipes": {
        const body = (request.body ?? {}) as { recipes?: DatasetRecipeRef[] };
        return ok({ matches: await resolveDatasetRecipeRefs(versionId, body.recipes ?? []) });
      }
      case "resource-art": {
        // Worker-only: plans and baked tables drawn with this dataset's art.
        const body = (request.body ?? {}) as { keys?: unknown };
        const keys = Array.isArray(body.keys) ? body.keys.filter((key): key is string => typeof key === "string") : [];
        return ok({ art: await getDatasetResourceArt(versionId, keys.slice(0, 20_000)) });
      }
      case "crops":
        return ok(await listDatasetCropFarmRecipes(versionId));
      case "mobs":
        return ok(await listDatasetEecMobs(versionId));
      case "resources":
        return ok(await queryDatasetResources(versionId, parseResourceQuery(params)));
      default:
        return { ok: false, status: 404, error: "Not found." };
    }
  } catch (error) {
    return { ok: false, status: 500, error: error instanceof Error ? error.message : failureText(endpoint) };
  }
}

/**
 * The recipe side of a dataset (the lookup index download and its search
 * index) is built ahead of the first recipe search, but never ahead of the
 * item list: it starts once requests have been quiet for a moment, or a while
 * after the catalog if nothing else is asked. A recipe search asked sooner
 * loads what it needs itself.
 */
const PREWARM_IDLE_MS = 4000;
const PREWARM_AFTER_REQUEST_MS = 1500;
const prewarmStarted = new Set<string>();
const prewarmTimers = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePrewarm(versionId: string, delayMs: number) {
  if (prewarmStarted.has(versionId)) return;
  // Each request pushes the start back: the page's opening burst (the list
  // sizing itself, the backdrop) settles before a 9 MiB download begins.
  const pending = prewarmTimers.get(versionId);
  if (pending !== undefined) {
    clearTimeout(pending);
  }
  prewarmTimers.set(
    versionId,
    setTimeout(() => {
      prewarmTimers.delete(versionId);
      if (prewarmStarted.has(versionId)) return;
      prewarmStarted.add(versionId);
      void prewarmDatasetVersion(versionId).catch((error) => {
        prewarmStarted.delete(versionId);
        console.error(`Dataset ${versionId} prewarm failed.`, error);
      });
    }, delayMs),
  );
}

function ok(json: unknown): DatasetApiResponse {
  return { ok: true, status: 200, json };
}

function failureText(endpoint: string): string {
  switch (endpoint) {
    case "catalog":
      return "Dataset catalog failed.";
    case "recipes":
      return "Recipe query failed.";
    case "recipe-ids":
      return "Recipe id list failed.";
    case "resolve-recipes":
      return "Recipe resolution failed.";
    case "crops":
      return "Crop query failed.";
    case "mobs":
      return "Mob query failed.";
    case "resources":
      return "Resource query failed.";
    default:
      return "Dataset request failed.";
  }
}

function parseRecipeQuery(params: URLSearchParams): Parameters<typeof queryDatasetRecipes>[1] {
  const resourceKind = params.get("resourceKind");
  const resourceId = params.get("resourceId");
  const clauses = parseClauses(params.getAll("clause"));
  return {
    query: params.get("query") ?? "",
    resource:
      resourceKind && resourceId && isRecipeResourceKind(resourceKind)
        ? { kind: resourceKind, id: resourceId }
        : undefined,
    mode: params.get("mode") === "uses" ? ("uses" as const) : ("recipes" as const),
    clauses: clauses.length > 0 ? clauses : undefined,
    takesOp: parseSideOp(params.get("takesOp")),
    makesOp: parseSideOp(params.get("makesOp")),
    allMaps: params.get("allMaps") === "1",
    mapSelection: parseMapSelection(params),
    recipeMap: params.get("recipeMap") || undefined,
    maxTier: parseTierFilter(params.get("maxTier")),
    offset: parseOffset(params.get("offset")),
    limit: parseLimit(params.get("limit"), 48),
  };
}

function parseResourceQuery(params: URLSearchParams): Parameters<typeof queryDatasetResources>[1] {
  const kindParam = params.get("kind");
  const sortParam = params.get("sort");
  const sourceParam = params.get("source");
  return {
    query: params.get("query") ?? "",
    offset: parseOffset(params.get("offset")),
    limit: parseLimit(params.get("limit"), 24),
    kind: kindParam === "item" || kindParam === "fluid" ? kindParam : undefined,
    mod: params.get("mod") ?? undefined,
    sort:
      sortParam === "name" ||
      sortParam === "mod" ||
      sortParam === "recipes" ||
      sortParam === "made" ||
      sortParam === "uses" ||
      sortParam === "common" ||
      sortParam === "popular"
        ? sortParam
        : undefined,
    source: sourceParam === "plants" || sourceParam === "bees" ? sourceParam : undefined,
    // Popularity was community data from the database; with no backend the
    // "popular" sort is plain best match, as the server answered before its
    // first sweep.
    popularity: undefined,
  };
}

function isRecipeResourceKind(value: string): value is ResourceKind {
  return RECIPE_RESOURCE_KINDS.has(value as ResourceKind);
}

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? Math.max(0, parsed) : 0;
}

function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(120, parsed)) : fallback;
}

function parseTierFilter(value: string | null): TierFilter {
  return (value || "all") as TierFilter;
}

function parseSideOp(value: string | null): RecipeQuerySideOp {
  return value === "all" || value === "only" ? value : "any";
}

/**
 * The machine chips' multi-select. `mapMode=exclude` lists unselected maps in
 * `map=` params, `mapMode=include` lists the selected ones (none is a valid
 * include list); absent means everything is selected.
 */
function parseMapSelection(
  params: URLSearchParams,
): { mode: "exclude" | "include"; maps: string[] } | undefined {
  const mode = params.get("mapMode");
  if (mode !== "exclude" && mode !== "include") {
    return undefined;
  }
  return { mode, maps: params.getAll("map") };
}

function parseClauses(raw: string[]): RecipeQueryClause[] {
  const clauses: RecipeQueryClause[] = [];
  for (const entry of raw) {
    const parsed = parseRecipeQueryClause(entry);
    if (parsed && isRecipeResourceKind(parsed.kind)) {
      clauses.push({ role: parsed.role, kind: parsed.kind, id: parsed.id });
    }
    if (clauses.length >= MAX_RECIPE_QUERY_CLAUSES) {
      break;
    }
  }
  return clauses;
}

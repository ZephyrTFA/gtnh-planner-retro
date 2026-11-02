import { describe, expect, it, vi } from "vitest";
import { getDatasetRecipe, queryDatasetRecipes, queryDatasetResources } from "./engine";
import { answerDatasetApi } from "./requests";

vi.mock("./engine", () => ({
  queryDatasetRecipes: vi.fn(async () => ({
    recipes: [],
    total: 0,
    recipeMaps: [],
    recipeMapIcons: {},
    offset: 0,
    limit: 48,
    hasMore: false,
  })),
  queryDatasetResources: vi.fn(async () => ({ resources: [], total: 0, offset: 0, limit: 24, hasMore: false })),
  getDatasetRecipe: vi.fn(async () => undefined),
  getDatasetCatalog: vi.fn(),
  getDatasetRecipeIds: vi.fn(),
  listDatasetCropFarmRecipes: vi.fn(),
  listDatasetEecMobs: vi.fn(),
  prewarmDatasetVersion: vi.fn(async () => undefined),
  resolveDatasetRecipeRefs: vi.fn(),
}));

function recipes(search: string) {
  return answerDatasetApi({ pathname: "/api/datasets/stable/recipes", search });
}

describe("dataset API in the browser", () => {
  it("accepts aspect resources for recipe lookups", async () => {
    await recipes("resourceKind=aspect&resourceId=thaumcraft%3Aaspect%3Aaer&mode=recipes");

    expect(queryDatasetRecipes).toHaveBeenCalledWith(
      "stable",
      expect.objectContaining({
        resource: { kind: "aspect", id: "thaumcraft:aspect:aer" },
        mode: "recipes",
      }),
    );
  });

  it("parses stencil clauses, side operators and the all-maps flag", async () => {
    await recipes(
      "clause=takes%3Aitem%3Agregtech%3Adust_iron&" +
        "clause=takes%3Aitem%3Agregtech%3Adust_coal&" +
        "clause=makes%3Aitem%3Agregtech%3Aingot_steel&" +
        "takesOp=all&allMaps=1",
    );

    expect(queryDatasetRecipes).toHaveBeenCalledWith(
      "stable",
      expect.objectContaining({
        clauses: [
          { role: "takes", kind: "item", id: "gregtech:dust_iron" },
          { role: "takes", kind: "item", id: "gregtech:dust_coal" },
          { role: "makes", kind: "item", id: "gregtech:ingot_steel" },
        ],
        takesOp: "all",
        makesOp: "any",
        allMaps: true,
        mapSelection: undefined,
      }),
    );
  });

  it("parses the machine chips' map selection", async () => {
    await recipes("allMaps=1&mapMode=exclude&map=Shaped%20Crafting&map=Assembler");

    expect(queryDatasetRecipes).toHaveBeenCalledWith(
      "stable",
      expect.objectContaining({
        allMaps: true,
        mapSelection: { mode: "exclude", maps: ["Shaped Crafting", "Assembler"] },
      }),
    );

    // An empty include list is a real state: nothing selected.
    await recipes("allMaps=1&mapMode=include");

    expect(queryDatasetRecipes).toHaveBeenLastCalledWith(
      "stable",
      expect.objectContaining({ mapSelection: { mode: "include", maps: [] } }),
    );
  });

  it("drops malformed clauses rather than failing the request", async () => {
    await recipes(
      "clause=eats%3Aitem%3Anope&clause=takes%3Adragon%3Anope&clause=broken&" +
        "clause=makes%3Afluid%3Aoxygen&makesOp=only",
    );

    expect(queryDatasetRecipes).toHaveBeenCalledWith(
      "stable",
      expect.objectContaining({
        clauses: [{ role: "makes", kind: "fluid", id: "oxygen" }],
        makesOp: "only",
        allMaps: false,
      }),
    );
  });

  it("caps resource pages and answers the popular sort without community data", async () => {
    await answerDatasetApi({
      pathname: "/api/datasets/stable/resources",
      search: "query=steel&limit=500&sort=popular&kind=item",
    });

    expect(queryDatasetResources).toHaveBeenCalledWith(
      "stable",
      expect.objectContaining({ query: "steel", limit: 120, sort: "popular", kind: "item", popularity: undefined }),
    );
  });

  it("answers a missing recipe as the route did", async () => {
    const response = await answerDatasetApi({ pathname: "/api/datasets/stable/recipes/gone%20id", search: "" });

    expect(getDatasetRecipe).toHaveBeenCalledWith("stable", "gone id");
    expect(response).toEqual({ ok: false, status: 404, error: "Recipe not found." });
  });
});

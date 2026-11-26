// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFactoryStore } from "@/store/factory-store";
import { PROJECT_SCHEMA_VERSION, type FactoryProject } from "@/lib/model/types";
import { sectionNodeId } from "@/lib/model/shared-machine";
import { DEFAULT_WORKSPACE_VIEW, writeWorkspaceView } from "@/lib/workspace-view";
import { DEFAULT_BOARD_VIEW, writeBoardView, type GlanceMode } from "./board-view";
import { RecipeNode } from "./RecipeNode";

/**
 * The zoomed-out faces of a shared machine. A card that runs several recipes
 * is ONE machine: its glance figures are the machine's, the same ones its
 * footer prints zoomed in, never the first recipe's alone.
 */

function recipe(id: string, input: string, output: string, eut: number) {
  return {
    id,
    name: id,
    machineType: "Electrolyzer",
    minimumTier: "LV",
    durationTicks: 20,
    eut,
    inputs: [{ kind: "item" as const, id: input, amount: 1 }],
    outputs: [{ kind: "item" as const, id: output, amount: 1 }],
  };
}

/** One LV electrolyzer running two recipes, each wired to drawers of its own. */
function project(): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "shared-glance",
    name: "Shared glance",
    fuelProfiles: [],
    recipes: [recipe("salt", "salt", "sodium", 16), recipe("rock-salt", "rock-salt", "potassium", 30)],
    nodes: [
      {
        id: "n",
        recipeId: "salt",
        extraRecipes: [{ recipeId: "rock-salt" }],
        enabled: true,
        machineCount: 1,
        parallel: 1,
        overclockTier: "LV",
        position: { x: 0, y: 0 },
      },
    ],
    storages: [
      { id: "salt-in", kind: "item", resourceId: "salt", position: { x: -200, y: 0 } },
      { id: "rock-in", kind: "item", resourceId: "rock-salt", position: { x: -200, y: 200 } },
      { id: "sodium-out", kind: "item", resourceId: "sodium", position: { x: 500, y: 0 } },
      { id: "potassium-out", kind: "item", resourceId: "potassium", position: { x: 500, y: 200 } },
    ],
    edges: [
      { id: "a-in", source: "salt-in", target: "n", resourceKind: "item", resourceId: "salt", sourceHandle: "output:item:salt", targetHandle: "input:item:salt" },
      { id: "a-out", source: "n", target: "sodium-out", resourceKind: "item", resourceId: "sodium", sourceHandle: "output:item:sodium", targetHandle: "input:item:sodium" },
      { id: "b-in", source: "rock-in", target: "n", resourceKind: "item", resourceId: "rock-salt", sourceHandle: "output:item:rock-salt", targetHandle: "r1:input:item:rock-salt" },
      { id: "b-out", source: "n", target: "potassium-out", resourceKind: "item", resourceId: "potassium", sourceHandle: "r1:output:item:potassium", targetHandle: "input:item:potassium" },
    ],
  };
}

function glanceText(mode: GlanceMode): string {
  writeBoardView({ glanceMode: mode });
  const state = useFactoryStore.getState();
  const projectNode = state.project.nodes[0];
  const view = render(
    <ReactFlowProvider>
      <RecipeNode
        {...({ id: projectNode.id } as object as Parameters<typeof RecipeNode>[0])}
        data={{
          projectNode,
          recipe: state.project.recipes[0],
          result: state.lastResult.nodes[projectNode.id],
        }}
        selected={false}
      />
    </ReactFlowProvider>,
  );
  const text = view.container.querySelector("[data-node-detail='glance']")?.textContent ?? "";
  view.unmount();
  return text.replace(/\s+/g, " ").trim();
}

// jsdom ships no ResizeObserver; the card only uses it to fit its title.
const originalObserver = globalThis.ResizeObserver;
beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  writeWorkspaceView({ ...DEFAULT_WORKSPACE_VIEW });
  writeBoardView({ ...DEFAULT_BOARD_VIEW });
  useFactoryStore.setState({ isReadOnly: false, checklistMode: false });
  useFactoryStore.getState().setProject(project());
});
afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  writeWorkspaceView({ ...DEFAULT_WORKSPACE_VIEW });
  writeBoardView({ ...DEFAULT_BOARD_VIEW });
});

describe("a shared machine's zoomed-out faces", () => {
  it("splits the machine between its two recipes", () => {
    const { nodes } = useFactoryStore.getState().lastResult;
    expect(nodes.n.utilization).toBeCloseTo(0.5);
    expect(nodes[sectionNodeId("n", 1)].utilization).toBeCloseTo(0.5);
  });

  it("prints the machine's usage on the Speed face, not the first recipe's share", () => {
    expect(glanceText("status")).toBe("100%");
  });

  it("prints the machine's usage on the Usage face, not the first recipe's share", () => {
    expect(glanceText("usage")).toMatch(/^100%/);
  });

  it("prints the machine's draw on the Power face under both PEAK and AVG", () => {
    // Peak is the hungriest recipe's draw; average weights each by its share.
    expect(glanceText("power")).toMatch(/^30 ?EU\/t/);
    writeWorkspaceView({ averageMachineDraw: true });
    expect(glanceText("power")).toMatch(/^23 ?EU\/t/);
  });
});

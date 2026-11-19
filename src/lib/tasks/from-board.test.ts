import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryProject, type Recipe } from "@/lib/model/types";
import { calculateThroughput } from "@/lib/solver/throughput";
import { closeBoundaries } from "@/lib/solver/close-boundaries";
import { buildMachineList } from "@/lib/model/machine-list";
import { boardTasksToAdd } from "./from-board";

const crush: Recipe = {
  id: "crush",
  name: "Crushed Iron",
  machineType: "Macerator",
  minimumTier: "LV",
  durationTicks: 20,
  eut: 8,
  inputs: [{ kind: "item", id: "iron", amount: 1 }],
  outputs: [{ kind: "item", id: "crushed", displayName: "Crushed Iron", amount: 1 }],
};

/** A source card the player dials by hand: the build list skips these. */
const supply: Recipe = {
  ...crush,
  id: "supply",
  name: "Iron Supply",
  machineType: "Custom Rate",
};

function project(over: Partial<FactoryProject> = {}): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "iron-line",
    name: "Iron Line",
    fuelProfiles: [],
    recipes: [crush, supply],
    edges: [],
    nodes: [
      {
        id: "macerator",
        recipeId: "crush",
        machineCount: 2,
        parallel: 1,
        enabled: true,
        overclockTier: "LV",
        position: { x: 0, y: 0 },
      },
      {
        id: "furnace",
        recipeId: "crush",
        machineCount: 1,
        parallel: 1,
        enabled: false,
        overclockTier: "LV",
        position: { x: 400, y: 0 },
      },
      {
        id: "source",
        recipeId: "supply",
        machineCount: 1,
        parallel: 1,
        enabled: true,
        overclockTier: "LV",
        position: { x: 800, y: 0 },
      },
    ],
    ...over,
  };
}

function tasksFor(p: FactoryProject) {
  return boardTasksToAdd(p, calculateThroughput(p));
}

describe("turning a board into tasks", () => {
  it("makes one task per machine card the build list counts", () => {
    const p = closeBoundaries(project());
    const tasks = tasksFor(p);
    // The disabled card and the hand-dialled source card are not machines to
    // build, and the build list already says so.
    expect(tasks.map((task) => task.title)).toEqual(["Macerator x2 (LV)"]);
    expect(tasks.length).toBe(buildMachineList(p, calculateThroughput(p)).length);
  });

  it("names the plan and the recipe in the detail line", () => {
    const [task] = tasksFor(closeBoundaries(project()));
    expect(task?.detail).toBe("Iron Line · Crushed Iron");
  });

  it("remembers the card the task came from", () => {
    const [task] = tasksFor(closeBoundaries(project()));
    expect(task?.source).toEqual({
      designId: "iron-line",
      designName: "Iron Line",
      nodeId: "macerator",
    });
    expect(task?.state).toBe("todo");
  });

  it("keeps the build list's own order under a newest-first read", () => {
    const p = closeBoundaries(project({ nodes: [project().nodes[0]!, { ...project().nodes[0]!, id: "macerator-2", machineCount: 5 }] }));
    const tasks = tasksFor(p);
    // The build list orders a tier by draw, biggest first, and the task list
    // must read the same way: the stamp steps DOWN so newest-first preserves it.
    expect(tasks.map((task) => task.title)).toEqual(["Macerator x5 (LV)", "Macerator x2 (LV)"]);
    expect(tasks[0]!.createdAt).toBeGreaterThan(tasks[1]!.createdAt);
  });

  it("gives a second press fresh ids and the same titles", () => {
    const p = closeBoundaries(project());
    const first = tasksFor(p);
    const again = tasksFor(p);
    expect(again.map((task) => task.title)).toEqual(first.map((task) => task.title));
    expect(again[0]!.id).not.toBe(first[0]!.id);
  });
});

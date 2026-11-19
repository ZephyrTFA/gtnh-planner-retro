"use client";

import {
  buildMachineList,
  formatMachineListCount,
  type MachineListEntry,
} from "@/lib/model/machine-list";
import type { FactoryProject, Recipe, ThroughputResult } from "@/lib/model/types";
import { randomUUID } from "@/lib/random-id";
import type { BoardTask } from "./task-board";

/**
 * The open board as tasks: one per machine card, in the order the build list
 * works through them (lowest tier first, then the biggest draw).
 *
 * The builder knows nothing about the list it feeds. Matching a card to the
 * task already made from it is the store's job (`addTasksFromBoard`), so
 * pressing the button twice is safe without this file knowing what is saved.
 */
export function boardTasksToAdd(
  project: FactoryProject,
  result: ThroughputResult,
): BoardTask[] {
  const recipes = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const now = Date.now();
  return buildMachineList(project, result).map((entry, index) => {
    const node = nodes.get(entry.nodeId);
    const recipe = node ? recipes.get(node.recipeId) : undefined;
    return {
      id: randomUUID(),
      title: taskTitle(entry),
      detail: taskDetail(project, recipe),
      state: "todo",
      // Stepping the stamp DOWN keeps the build list's order under the
      // newest-first read, instead of reversing it into a coin toss of ties.
      createdAt: now - index,
      source: { designId: project.id, designName: project.name, nodeId: entry.nodeId },
    };
  });
}

/** "Macerator x2 (LV)": what to build, how many, at which tier. */
function taskTitle(entry: MachineListEntry): string {
  const tier = entry.tier ? ` (${entry.tier})` : "";
  return `${entry.label} x${formatMachineListCount(entry.count)}${tier}`;
}

/** "Iron Line · Crushed Iron": which plan the card is on, and what it makes. */
function taskDetail(project: FactoryProject, recipe: Recipe | undefined): string {
  return recipe ? `${project.name} · ${recipe.name}` : project.name;
}

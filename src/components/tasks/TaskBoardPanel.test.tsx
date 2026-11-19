// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryProject, type Recipe } from "@/lib/model/types";
import { closeBoundaries } from "@/lib/solver/close-boundaries";
import { useFactoryStore } from "@/store/factory-store";
import { TASK_BOARD_STORAGE_KEY, type TaskState } from "@/lib/tasks/task-board";
import { TaskBoardPanel } from "./TaskBoardPanel";

afterEach(cleanup);

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

function seedPlan(cards: number) {
  const p: FactoryProject = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "iron-line",
    name: "Iron Line",
    fuelProfiles: [],
    recipes: [crush],
    edges: [],
    nodes: Array.from({ length: cards }, (_, index) => ({
      id: `m${index}`,
      recipeId: "crush",
      machineCount: 2,
      parallel: 1,
      enabled: true,
      overclockTier: "LV",
      position: { x: index * 400, y: 0 },
    })),
  };
  useFactoryStore.getState().setProject(closeBoundaries(p));
}

function section(state: TaskState): HTMLElement {
  const node = document.querySelector(`[data-task-section="${state}"]`);
  if (!node) throw new Error(`no section for ${state}`);
  return node as HTMLElement;
}

/** An empty list has no sections at all, only the line that says so. */
function rows(state: TaskState): string[] {
  const node = document.querySelector(`[data-task-section="${state}"]`);
  return node
    ? Array.from(node.querySelectorAll("[data-task-title-text]")).map(
        (row) => row.textContent ?? "",
      )
    : [];
}

/** Opens or shuts one section's list. */
function unfold(state: TaskState) {
  fireEvent.click(document.querySelector(`[data-task-fold="${state}"]`)!);
}

function typeTitle(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>("[data-task-new-title]")!;
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("the Tasks panel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The module caches its snapshot, so point it at the cleared key.
    window.dispatchEvent(new StorageEvent("storage", { key: TASK_BOARD_STORAGE_KEY }));
    seedPlan(2);
    useFactoryStore.setState({ isReadOnly: false });
  });

  it("adds a typed task to Need to be done and clears the inputs", () => {
    const { container } = render(<TaskBoardPanel />);
    const input = typeTitle(container, "Build the pump");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(rows("todo")).toEqual(["Build the pump"]);
    expect(input.value).toBe("");
  });

  it("advances a task with its chip", () => {
    const { container } = render(<TaskBoardPanel />);
    fireEvent.keyDown(typeTitle(container, "Build the pump"), { key: "Enter" });

    const chip = within(section("todo")).getByRole("button", { name: "Need to be done" });
    fireEvent.click(chip);
    expect(rows("doing")).toEqual(["Build the pump"]);
    expect(rows("todo")).toEqual([]);
  });

  it("adds the board's cards once and says what it did", () => {
    const { container } = render(<TaskBoardPanel />);
    const add = container.querySelector<HTMLButtonElement>("[data-task-add-from-board]")!;

    fireEvent.click(add);
    expect(rows("todo")).toEqual(["Macerator x2 (LV)", "Macerator x2 (LV)"]);
    expect(container.querySelector("[data-task-status]")?.textContent).toContain("2");

    fireEvent.click(add);
    expect(rows("todo")).toHaveLength(2);
    expect(container.querySelector("[data-task-status]")?.textContent).toMatch(/nothing new/i);
  });

  it("clears only the done tasks", () => {
    const { container } = render(<TaskBoardPanel />);
    fireEvent.keyDown(typeTitle(container, "Pump"), { key: "Enter" });
    fireEvent.keyDown(typeTitle(container, "Tank"), { key: "Enter" });

    // Tank is the newest row, so it is the first chip in the section.
    const [tankChip] = within(section("todo")).getAllByRole("button", { name: "Need to be done" });
    fireEvent.click(tankChip!);
    fireEvent.click(within(section("doing")).getByRole("button", { name: "Being done" }));

    unfold("done");
    fireEvent.click(within(section("done")).getByRole("button", { name: "Clear done" }));

    expect(rows("done")).toEqual([]);
    expect(rows("todo")).toEqual(["Pump"]);
  });

  it("names both ways in when the list is empty", () => {
    const { container } = render(<TaskBoardPanel />);
    const empty = container.querySelector("[data-task-empty]")?.textContent ?? "";
    expect(empty).toMatch(/add one/i);
    expect(empty).toMatch(/board/i);
  });

  it("edits the list on a read-only plan", () => {
    useFactoryStore.setState({ isReadOnly: true });
    const { container } = render(<TaskBoardPanel />);
    fireEvent.keyDown(typeTitle(container, "Still mine"), { key: "Enter" });
    expect(rows("todo")).toEqual(["Still mine"]);
  });

  it("opens the editor from the row and deletes the task", () => {
    const { container } = render(<TaskBoardPanel />);
    fireEvent.keyDown(typeTitle(container, "Pump"), { key: "Enter" });

    const row = section("todo").querySelector("[data-task-row]") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Pump" }));

    const editor = within(row).getByTestId("task-editor");
    fireEvent.click(within(editor).getByRole("button", { name: "Delete" }));
    expect(rows("todo")).toEqual([]);
  });

  it("keeps a task out of the sections when its title is edited away", () => {
    const { container } = render(<TaskBoardPanel />);
    fireEvent.keyDown(typeTitle(container, "Pump"), { key: "Enter" });
    const row = section("todo").querySelector("[data-task-row]") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Pump" }));
    const title = within(row).getByTestId("task-edit-title");
    fireEvent.change(title, { target: { value: "  " } });
    fireEvent.blur(title);
    expect(rows("todo")).toEqual([]);
  });
});

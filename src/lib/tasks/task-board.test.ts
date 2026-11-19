// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTask,
  addTasksFromBoard,
  advanceTask,
  clearDoneTasks,
  editTask,
  openTaskCount,
  readTaskBoard,
  setTaskState,
  TASK_BOARD_STORAGE_KEY,
  TASK_STATE_ORDER,
  type BoardTask,
} from "./task-board";

/** What the key holds right now, straight out of storage. */
function stored(): BoardTask[] {
  return JSON.parse(window.localStorage.getItem(TASK_BOARD_STORAGE_KEY) ?? "[]");
}

/** A task made from a card, the way "Add from board" makes them. */
function fromCard(nodeId: string, createdAt = 500): BoardTask {
  return {
    id: `task-${nodeId}`,
    title: `Macerator (${nodeId})`,
    detail: "Iron line · Crush",
    state: "todo",
    createdAt,
    source: { designId: "plan-a", designName: "Iron line", nodeId },
  };
}

/** Make the module re-read the key, as it does for another tab's write. */
function reread() {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: TASK_BOARD_STORAGE_KEY,
      newValue: window.localStorage.getItem(TASK_BOARD_STORAGE_KEY),
      storageArea: window.localStorage,
    }),
  );
}

describe("the task board", () => {
  beforeEach(() => {
    window.localStorage.clear();
    reread();
    // Distinct, rising stamps: two adds in the same millisecond would make
    // the newest-first order a coin toss.
    let clock = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1));
  });

  it("adds a task as not started", () => {
    addTask("Build the blast furnace", "Needs the IV hull");
    const tasks = readTaskBoard();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: "Build the blast furnace",
      detail: "Needs the IV hull",
      state: "todo",
    });
    expect(stored()).toHaveLength(1);
  });

  it("ignores a blank title", () => {
    addTask("   ");
    expect(readTaskBoard()).toEqual([]);
  });

  it("clips a title to 120 characters and a detail to 2000", () => {
    addTask("x".repeat(400), "y".repeat(4000));
    const [task] = readTaskBoard();
    expect(task?.title).toHaveLength(120);
    expect(task?.detail).toHaveLength(2000);
  });

  it("advances a task through the three states and back to the first", () => {
    addTask("Pump");
    const id = readTaskBoard()[0]!.id;
    expect(TASK_STATE_ORDER).toEqual(["todo", "doing", "done"]);
    advanceTask(id);
    expect(readTaskBoard()[0]?.state).toBe("doing");
    advanceTask(id);
    expect(readTaskBoard()[0]?.state).toBe("done");
    advanceTask(id);
    expect(readTaskBoard()[0]?.state).toBe("todo");
  });

  it("sets a state directly", () => {
    addTask("Pump");
    const id = readTaskBoard()[0]!.id;
    setTaskState(id, "done");
    expect(readTaskBoard()[0]?.state).toBe("done");
  });

  it("reads the newest task first", () => {
    addTask("First");
    addTask("Second");
    expect(readTaskBoard().map((task) => task.title)).toEqual(["Second", "First"]);
  });

  it("deletes a task whose title is edited to nothing", () => {
    addTask("Pump");
    const id = readTaskBoard()[0]!.id;
    editTask(id, { title: "   " });
    expect(readTaskBoard()).toEqual([]);
  });

  it("edits a detail and keeps the title", () => {
    addTask("Pump", "LV");
    const id = readTaskBoard()[0]!.id;
    editTask(id, { detail: "MV" });
    expect(readTaskBoard()[0]).toMatchObject({ title: "Pump", detail: "MV" });
  });

  it("clears only the done tasks", () => {
    addTask("Pump");
    addTask("Tank");
    const [tank, pump] = readTaskBoard();
    setTaskState(tank!.id, "done");
    clearDoneTasks();
    expect(readTaskBoard().map((task) => task.title)).toEqual([pump!.title]);
  });

  it("counts the tasks that are not done", () => {
    addTask("Pump");
    addTask("Tank");
    const [tank] = readTaskBoard();
    expect(openTaskCount(readTaskBoard())).toBe(2);
    setTaskState(tank!.id, "done");
    expect(openTaskCount(readTaskBoard())).toBe(1);
    expect(openTaskCount([{ ...tank!, state: "done" as const }])).toBe(0);
  });

  it("adds board cards once, whatever the press", () => {
    expect(addTasksFromBoard([fromCard("card-1"), fromCard("card-2", 499)])).toHaveLength(2);
    expect(readTaskBoard()).toHaveLength(2);
    expect(addTasksFromBoard([fromCard("card-1"), fromCard("card-2", 499)])).toEqual([]);
    expect(readTaskBoard()).toHaveLength(2);
  });

  it("adds a card the list has never seen beside the ones it has", () => {
    addTasksFromBoard([fromCard("card-1")]);
    addTask("Typed by hand");
    const added = addTasksFromBoard([fromCard("card-1"), fromCard("card-2", 499)]);
    expect(added).toHaveLength(1);
    expect(readTaskBoard().map((task) => task.title)).toEqual([
      "Typed by hand",
      "Macerator (card-1)",
      "Macerator (card-2)",
    ]);
  });

  it("keeps the tasks that parse and drops the rest", () => {
    window.localStorage.setItem(
      TASK_BOARD_STORAGE_KEY,
      JSON.stringify([
        { id: "a", title: "Kept", detail: "", state: "doing", createdAt: 5 },
        { id: "b", title: "Dropped state", detail: "", state: "archived", createdAt: 6 },
        { id: "c", title: 42, detail: "", state: "todo", createdAt: 7 },
        { id: "d", title: "No stamp", detail: "", state: "todo" },
        { title: "No id", detail: "", state: "todo", createdAt: 9 },
        "not a task",
        null,
      ]),
    );
    reread();
    expect(readTaskBoard().map((task) => task.title)).toEqual(["Kept"]);
    clearDoneTasks();
    expect(stored().map((task) => task.title)).toEqual(["Kept"]);
  });

  it("keeps a task whose source is half there, without the source", () => {
    window.localStorage.setItem(
      TASK_BOARD_STORAGE_KEY,
      JSON.stringify([
        { ...fromCard("card-1"), source: { designId: "plan-a" } },
        { ...fromCard("card-2"), source: "Iron line" },
      ]),
    );
    reread();
    // The player's text is worth keeping; the card it claimed is not
    // recoverable, so the task is kept as a hand-typed one.
    expect(readTaskBoard().map((task) => task.source)).toEqual([undefined, undefined]);
  });

  it("picks up a write from another tab", () => {
    window.localStorage.setItem(
      TASK_BOARD_STORAGE_KEY,
      JSON.stringify([
        { id: "z", title: "From the other tab", detail: "", state: "todo", createdAt: 9 },
      ]),
    );
    reread();
    expect(readTaskBoard().map((task) => task.title)).toEqual(["From the other tab"]);
  });

  it("keeps working when storage refuses the write", () => {
    addTask("Typed before the quota");
    const setItem = vi
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => addTask("Pump")).not.toThrow();
    expect(readTaskBoard().map((task) => task.title)).toEqual(["Pump", "Typed before the quota"]);
    setItem.mockRestore();
  });
});

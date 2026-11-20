"use client";

import { useSyncExternalStore } from "react";
import { randomUUID } from "@/lib/random-id";

/**
 * The player's own task list: what is left to build, in three states.
 *
 * It is personal state, not plan data. It lives in localStorage beside the
 * workspace view (`src/lib/workspace-view.ts`), not in `FactoryProject`, so it
 * survives every design, never travels through export, import or a shared
 * link, and stays editable on a read-only plan someone else posted.
 *
 * The whole list is one blob. Two tabs share it by last write winning: a lost
 * edit is one keystroke, not a plan, so there is no compare-and-write here,
 * only a `storage` listener so a tab shows what the other one saved.
 */

export type TaskState = "todo" | "doing" | "done";

/** The column order the panel renders, and the order a chip walks. */
export const TASK_STATE_ORDER: readonly TaskState[] = ["todo", "doing", "done"];

export interface BoardTask {
  id: string;
  /** Required: a task with no title is a task the player abandoned. */
  title: string;
  /** Optional body; empty rather than absent, so rows never branch on it. */
  detail: string;
  state: TaskState;
  /** Epoch ms. The order within a state, newest first. */
  createdAt: number;
  /** Set only by "Add from board": the card this task was made from. */
  source?: { designId: string; designName: string; nodeId: string };
}

const TITLE_MAX = 120;
const DETAIL_MAX = 2000;

export const TASK_BOARD_STORAGE_KEY = "gtnh-factory-flow-tasks.v1";

/** The shared empty list: stable identity is what `useSyncExternalStore` needs. */
const NO_TASKS: BoardTask[] = [];

let tasks: BoardTask[] = NO_TASKS;
let loaded = false;
let watchingTabs = false;
const listeners = new Set<() => void>();

function isTaskState(value: unknown): value is TaskState {
  return typeof value === "string" && (TASK_STATE_ORDER as readonly string[]).includes(value);
}

/**
 * One stored entry, or nothing. A blob from a future version, a hand-edited
 * one or a half-written one costs the entries that no longer parse and never
 * the whole list, so a bad key cannot wipe a player's afternoon.
 */
function parseTask(value: unknown): BoardTask | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const entry = value as Partial<Record<keyof BoardTask, unknown>>;
  if (typeof entry.id !== "string" || entry.id.length === 0) return undefined;
  // A title is the whole task: a row with none cannot be read, and a blob
  // that carries one (hand-edited, or written by a version that allowed it)
  // loses the row rather than showing a blank line forever.
  if (typeof entry.title !== "string" || entry.title.trim().length === 0) return undefined;
  if (!isTaskState(entry.state)) return undefined;
  if (typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt)) return undefined;

  const source = entry.source;
  const parsed: BoardTask = {
    id: entry.id,
    title: entry.title.slice(0, TITLE_MAX),
    detail: typeof entry.detail === "string" ? entry.detail.slice(0, DETAIL_MAX) : "",
    state: entry.state,
    createdAt: entry.createdAt,
  };
  // A half-there source is no source: the card it named cannot be re-found,
  // and a task that claims a card it cannot show would block its own re-add.
  if (
    typeof source === "object" &&
    source !== null &&
    typeof (source as { designId?: unknown }).designId === "string" &&
    typeof (source as { designName?: unknown }).designName === "string" &&
    typeof (source as { nodeId?: unknown }).nodeId === "string"
  ) {
    const stamp = source as { designId: string; designName: string; nodeId: string };
    parsed.source = {
      designId: stamp.designId,
      designName: stamp.designName,
      nodeId: stamp.nodeId,
    };
  }
  return parsed;
}

function readStoredTasks(): BoardTask[] {
  try {
    const raw = window.localStorage.getItem(TASK_BOARD_STORAGE_KEY);
    if (!raw) {
      return NO_TASKS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return NO_TASKS;
    }
    return sortTasks(parsed.map(parseTask).filter((task): task is BoardTask => task !== undefined));
  } catch {
    return NO_TASKS;
  }
}

/** Newest first, which is how every column lists its tasks. */
function sortTasks(list: BoardTask[]): BoardTask[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

function watchTabs() {
  if (watchingTabs || typeof window === "undefined") {
    return;
  }
  watchingTabs = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== TASK_BOARD_STORAGE_KEY) {
      return;
    }
    tasks = readStoredTasks();
    notify();
  });
}

function getSnapshot(): BoardTask[] {
  if (!loaded) {
    loaded = true;
    watchTabs();
    tasks = readStoredTasks();
  }
  return tasks;
}

/** The server renders an empty list; the client fills it before paint. */
function getServerSnapshot(): BoardTask[] {
  return NO_TASKS;
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function writeTasks(next: BoardTask[]) {
  tasks = sortTasks(next);
  try {
    window.localStorage.setItem(TASK_BOARD_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // A full or blocked quota costs the visit's permanence, not the list:
    // the tasks stay in memory and the panel keeps working.
  }
  notify();
}

/** The same value the hook returns, for callers outside React. */
export function readTaskBoard(): BoardTask[] {
  return getSnapshot();
}

export function useTaskBoard(): BoardTask[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const clip = (value: string, max: number) => value.trim().slice(0, max);

export function addTask(title: string, detail = ""): void {
  const clipped = clip(title, TITLE_MAX);
  if (!clipped) {
    return;
  }
  writeTasks([
    ...getSnapshot(),
    {
      id: randomUUID(),
      title: clipped,
      detail: clip(detail, DETAIL_MAX),
      state: "todo",
      createdAt: Date.now(),
    },
  ]);
}

export function setTaskState(id: string, state: TaskState): void {
  const current = getSnapshot();
  const task = current.find((entry) => entry.id === id);
  if (!task || task.state === state) {
    return;
  }
  writeTasks(current.map((entry) => (entry.id === id ? { ...entry, state } : entry)));
}

/** The chip's click: Pending, Working, Done, then round again. */
export function advanceTask(id: string): void {
  const task = getSnapshot().find((entry) => entry.id === id);
  if (!task) {
    return;
  }
  const next = TASK_STATE_ORDER[
    (TASK_STATE_ORDER.indexOf(task.state) + 1) % TASK_STATE_ORDER.length
  ];
  setTaskState(id, next ?? "todo");
}

export function editTask(
  id: string,
  patch: { title?: string; detail?: string },
): void {
  const current = getSnapshot();
  const task = current.find((entry) => entry.id === id);
  if (!task) {
    return;
  }
  const title = patch.title === undefined ? task.title : clip(patch.title, TITLE_MAX);
  // A title edited away is a task abandoned: there is no such thing as an
  // untitled row, so the row goes rather than sitting there nameless.
  if (!title) {
    deleteTask(id);
    return;
  }
  const detail = patch.detail === undefined ? task.detail : clip(patch.detail, DETAIL_MAX);
  writeTasks(current.map((entry) => (entry.id === id ? { ...entry, title, detail } : entry)));
}

export function deleteTask(id: string): void {
  const current = getSnapshot();
  writeTasks(current.filter((entry) => entry.id !== id));
}

export function clearDoneTasks(): void {
  const current = getSnapshot();
  writeTasks(current.filter((entry) => entry.state !== "done"));
}

/**
 * Puts the tasks "Add from board" built into the list, skipping any whose card
 * is already there. Progress is never reset: a task the player moved to Done
 * stays in Done whatever the board says now, and a card the player deleted
 * leaves its task behind as a reminder.
 */
export function addTasksFromBoard(incoming: BoardTask[]): string[] {
  const current = getSnapshot();
  const known = new Set(
    current
      .filter((entry) => entry.source)
      .map((entry) => `${entry.source!.designId}/${entry.source!.nodeId}`),
  );
  const added: BoardTask[] = [];
  for (const task of incoming) {
    if (!task.source) {
      added.push({ ...task, id: task.id || randomUUID() });
      continue;
    }
    const card = `${task.source.designId}/${task.source.nodeId}`;
    if (known.has(card)) {
      continue;
    }
    known.add(card);
    added.push(task);
  }
  if (added.length === 0) {
    return [];
  }
  writeTasks([...current, ...added]);
  return added.map((task) => task.id);
}

/** What the tab's badge counts: everything not Done. */
export function openTaskCount(list: BoardTask[]): number {
  return list.filter((entry) => entry.state !== "done").length;
}

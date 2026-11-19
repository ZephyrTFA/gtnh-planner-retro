# Task Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax with a leading `- [ ]` so a worker can tick them.

**Goal:** Give the planner a personal three-state task list in its right-hand column, with a button that turns the open board's machine cards into tasks.

**Architecture:** One localStorage-backed module (`src/lib/tasks/task-board.ts`) is the only door to the list, read through `useSyncExternalStore` exactly as `src/lib/workspace-view.ts` reads workspace taste. A pure builder (`src/lib/tasks/from-board.ts`) turns the open plan into tasks. `InspectorPanel` grows a two-button tab strip that switches its content between the resource panel and the new `TaskBoardPanel`.

**Tech Stack:** Next.js App Router, TypeScript strict, React 19, Zustand, Tailwind, Vitest + Testing Library (jsdom), Playwright for the real-app check.

**Spec:** `docs/superpowers/specs/2026-11-19-task-board-design.md`

## Global Constraints

- TypeScript strict; `npm run typecheck` must stay clean.
- Every player-facing string goes through `t("English")` (or `tPlural`), keys are double-quoted literals, and `ru_RU.ts` plus `zh_CN.ts` gain their translations in the same commit — `src/lib/i18n/i18n-catalogs.test.ts` fails until both catalogs cover every literal in the source.
- Player-facing copy is plain and short: the number, the rule, the consequence. No quips, no em dashes.
- Nothing generated goes in the repo root: probes and screenshots go in `scratch/`.
- The task list is never part of a plan: it must not enter `FactoryProject`, the solve, export, import or a shared link.
- Column widths are shell px: the right column is 234px, and viewport units inside the shell use `--ui-vh` / `--ui-vw`.
- Tests run with `npx vitest run <file>`; the full suite is `npm run test`.

## Review Focus

- A stored blob that is hand-edited, from a future version, or half-written (unknown `state`, missing `detail`, `title` not a string, an array where an object belongs) → the tasks that parse survive, the rest are dropped, the list is never wiped and the panel never throws.
- `localStorage` blocked or full (private browsing, quota) → the list still works in memory for the visit and every write is swallowed silently.
- Two tabs on one browser → a task added in one appears in the other without a reload, and neither tab loses its own new keystroke louder than the other's whole list.
- A plan opened read-only (someone else's shared setup) → the task list is still editable, because it is the player's own state, not the plan's.
- A board whose cards are disabled, custom-rate or crop-only → `buildMachineList` already skips them, and "Add from board" must not invent tasks for machines the build list does not count.

---

### Task 1: The task list module

**Files:**
- Create: `src/lib/tasks/task-board.ts`
- Test: `src/lib/tasks/task-board.test.ts`

**Interfaces:**
- Consumes: `randomUUID()` from `src/lib/random-id.ts`.
- Produces:
  - `type TaskState = "todo" | "doing" | "done"`
  - `interface BoardTask { id: string; title: string; detail: string; state: TaskState; createdAt: number; source?: { designId: string; designName: string; nodeId: string } }`
  - `TASK_STATE_ORDER: readonly TaskState[]` — `["todo", "doing", "done"]`, the column order the panel renders.
  - `useTaskBoard(): BoardTask[]` — newest `createdAt` first, stable array identity between writes.
  - `readTaskBoard(): BoardTask[]` — the same snapshot for callers outside React.
  - `addTask(title: string, detail?: string): void` — a blank title adds nothing; the title is clipped to 120 characters and the detail to 2000, both trimmed.
  - `setTaskState(id: string, state: TaskState): void`
  - `advanceTask(id: string): void` — `todo` to `doing` to `done` back to `todo`.
  - `editTask(id: string, patch: { title?: string; detail?: string }): void` — an empty resulting title deletes the task instead.
  - `deleteTask(id: string): void`
  - `clearDoneTasks(): void`
  - `addTasksFromBoard(tasks: BoardTask[]): string[]` — appends only the tasks whose `source` (`designId` plus `nodeId`) is not already in the list, returns the ids appended.
  - `openTaskCount(tasks: BoardTask[]): number` — the tasks that are not `done`, for the tab's badge.
  - `TASK_BOARD_STORAGE_KEY` = `"gtnh-factory-flow-tasks.v1"`.

- [ ] **Step 1: Write the failing test** in `src/lib/tasks/task-board.test.ts` (`// @vitest-environment jsdom` on line 1, `window.localStorage.clear()` in `beforeEach`). Cover, one `it` each:
  - `addTask` puts a task in `todo` and `advanceTask` walks it `todo` to `doing` to `done` to `todo`.
  - the list reads newest first: two adds come back with the later `createdAt` first.
  - a blank or whitespace-only title adds nothing; a 400-character title lands clipped to 120.
  - `editTask` with `title: "  "` deletes the task; with `detail` it keeps the title.
  - `clearDoneTasks` removes only `done` tasks.
  - `addTasksFromBoard` adds two, then adds nothing on the second call with the same two sources, and returns the ids it appended.
  - a blob holding one good task and one with `state: "archived"` leaves exactly the good one in both memory and storage after the next write.
  - a `storage` event written by another tab (dispatch `new StorageEvent("storage", { key, newValue, storageArea: window.localStorage })` after writing the key directly) is picked up by `readTaskBoard()`.
  - with `window.localStorage.setItem` stubbed to throw, `addTask` still shows the task in `readTaskBoard()` and does not throw.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tasks/task-board.test.ts`
Expected: FAIL, cannot resolve `./task-board`.

- [ ] **Step 3: Write `src/lib/tasks/task-board.ts`** as the module-level twin of `src/lib/workspace-view.ts`: a `let` snapshot with a `loaded` flag, a `Set` of listeners, `getSnapshot()` that reads lazily, `getServerSnapshot()` returning a shared frozen empty array, `writeTasks(next)` that stores the JSON and notifies, and a `window` `storage` listener installed once on first client read. Validate on the way in field by field (see Review Focus). `addTasksFromBoard` matches on `source.designId` plus `source.nodeId` and ignores tasks with no `source`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tasks/task-board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/task-board.ts src/lib/tasks/task-board.test.ts
git commit -m "The task list's storage module: one localStorage blob beside any plan, validated on the way in, live across tabs"
```

---

### Task 2: Turning a board into tasks

**Files:**
- Create: `src/lib/tasks/from-board.ts`
- Test: `src/lib/tasks/from-board.test.ts`

**Interfaces:**
- Consumes: `buildMachineList`, `formatMachineListCount` from `src/lib/model/machine-list`; `BoardTask` from `./task-board`; `FactoryProject`, `ThroughputResult` from `src/lib/model/types`.
- Produces: `boardTasksToAdd(project: FactoryProject, result: ThroughputResult): BoardTask[]` — one task per entry `buildMachineList` returns, in its order, each with `state: "todo"`, `source: { designId: project.id, designName: project.name, nodeId }`, and `createdAt` stepping down by 1 ms from `Date.now()` so the list's newest-first read reproduces the build list's own order.

- [ ] **Step 1: Write the failing test** in `src/lib/tasks/from-board.test.ts`. Build a small `FactoryProject` the way `src/store/checklist.test.ts` does (one recipe, two nodes, one drawer) and a `ThroughputResult` from `calculateThroughput(project)`. Assert:
  - two enabled cards give two tasks titled `"Macerator x2 (LV)"` style: `"<handler label> x<count>"`, with `" (<tier>)"` only when the entry has a tier; the count goes through `formatMachineListCount`.
  - the detail is `"<plan name> · <recipe name>"`, the recipe found through the node's `recipeId`.
  - `source` names the plan id, the plan name and the node id.
  - a disabled card (`enabled: false`) and a custom-rate recipe card produce no task, because `buildMachineList` skips them.
  - reading the same board twice gives the same titles with different ids, so a second press is a dedupe problem for the store, not for the builder.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tasks/from-board.test.ts`
Expected: FAIL, cannot resolve `./from-board`.

- [ ] **Step 3: Write `src/lib/tasks/from-board.ts`** — map entries to tasks, looking the recipe up with `new Map(project.recipes.map(r => [r.id, r]))` via `project.nodes.find(n => n.id === entry.nodeId)?.recipeId`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tasks/from-board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/from-board.ts src/lib/tasks/from-board.test.ts
git commit -m "One task per machine card: the open board becomes a build list you can work through"
```

---

### Task 3: The Tasks panel

**Files:**
- Create: `src/components/tasks/TaskBoardPanel.tsx`
- Create: `src/components/tasks/TaskBoardPanel.test.tsx`
- Modify: `src/lib/i18n/ru_RU.ts`, `src/lib/i18n/zh_CN.ts`

**Interfaces:**
- Consumes: everything Task 1 and Task 2 produce; `useFactoryStore` for `project` and `lastResult`; `useT` from `@/lib/i18n`.
- Produces: `TaskBoardPanel()` — a React component with no props, filling the right column. It renders, in order: an `Add from board` button, a one-line result of the last press, the add row (title input, detail input, Enter adds), then one section per `TASK_STATE_ORDER` entry with a foldable heading, its count, `Clear done` in the `done` heading, and rows. A row is a state chip button, the title, the detail as a second line; clicking the row opens inline editing (title field, detail textarea, three-way state control, delete).

- [ ] **Step 1: Write the failing test** in `src/components/tasks/TaskBoardPanel.test.tsx` (`// @vitest-environment jsdom`, seed `useFactoryStore` with a plan and clear the task key in `beforeEach`). Assert:
  - typing a title and pressing Enter adds a row under "Need to be done" and empties the inputs.
  - clicking the chip on that row moves it to "Being done".
  - "Add from board" on a two-card plan adds two rows and reports the count; pressing it again adds none and says nothing was new.
  - "Clear done" empties the Done section only.
  - deleting the last task leaves the empty-state line, which names both ways in: add one, or turn the board into a list.
  - with `useFactoryStore` flagged `isReadOnly` (someone else's shared plan), the add row and the chip still work: the plan is read-only, the list is the player's.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/tasks/TaskBoardPanel.test.tsx`
Expected: FAIL, cannot resolve `./TaskBoardPanel`.

- [ ] **Step 3: Implement the panel** in the column's existing visual language (`bg-surface`, `border-line-strong`, `text-fg-subtle`, 12px rows like `inspector/panel.css`). Every string through `t()`. Then add the Russian and Chinese translations for each new literal to both catalogs, in the same commit.

- [ ] **Step 4: Run the panel test and the catalog test**

Run: `npx vitest run src/components/tasks/TaskBoardPanel.test.tsx src/lib/i18n/i18n-catalogs.test.ts`
Expected: PASS in both.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks src/lib/i18n
git commit -m "The Tasks panel: three folded sections, a chip that advances a task, and Add from board"
```

---

### Task 4: The right column's tabs

**Files:**
- Modify: `src/lib/workspace-view.ts`
- Modify: `src/components/InspectorPanel.tsx:287-300`
- Modify: `src/components/InspectorPanel.test.tsx`

**Interfaces:**
- Consumes: `TaskBoardPanel`, `useTaskBoard`, `openTaskCount`.
- Produces: `WorkspaceView.rightPanelTab: "resources" | "tasks"`, default `"resources"`, stored in the same blob; `InspectorPanel` renders a two-button strip above whichever content the tab selects.

- [ ] **Step 1: Write the failing tests.** In `src/lib/workspace-view.test.ts`: a stored blob with `rightPanelTab: "tasks"` reads back as `"tasks"`, and a blob with `"settings"` or a non-string reads back as `"resources"`. In `src/components/InspectorPanel.test.tsx`: rendering the panel shows both tab buttons with Resources selected and the resource rows under it; clicking Tasks swaps in the Tasks panel and the resource rows are gone; the Tasks button carries the open-task count and ignores done tasks; the choice is written to the workspace blob.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/workspace-view.test.ts src/components/InspectorPanel.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement.** Add the field to `WorkspaceView`, `DEFAULT_WORKSPACE_VIEW` and `readWorkspaceView` (validate it against the two known ids, default otherwise). In `InspectorPanel`, keep the `<aside className="inspector-panel ...">` wrapper, put the strip in its own small component in the same file, and switch the body. The strip must not disturb the column's height budget: the resource panel's virtual list measures its rows, so keep the strip a fixed-height flex row above it.

- [ ] **Step 4: Run the whole suite and typecheck**

Run: `npm run typecheck && npm run test`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-view.ts src/lib/workspace-view.test.ts src/components/InspectorPanel.tsx src/components/InspectorPanel.test.tsx
git commit -m "The right column gains a Tasks tab beside Resources, so the list reads with the board in view"
```

---

### Task 5: Real-app check and the release stamps

**Files:**
- Modify: `src/lib/version.ts`
- Modify: `src/lib/changelog.ts`
- Modify: `docs/OVERVIEW.md`
- Probe (not committed): `scratch/probes/task-board.mjs`

**Interfaces:**
- Consumes: the finished feature.
- Produces: `APP_VERSION` 1.7.0, one changelog entry, one OVERVIEW line, and a Playwright run that proves the shipped behaviour.

- [ ] **Step 1: Probe the real app.** Serve `out/` from a built tree with its `_headers` (per `AGENTS.md`, not the dev server), then drive it headless with `playwright-core` and the system Chromium (`CHROMIUM=$(nix shell nixpkgs#chromium -c command -v chromium)`, `TMPDIR=/tmp/pw`). Open a plan with cards, switch the right column to Tasks, add a task, advance its chip, press Add from board twice, reload the page and confirm the list and the tab choice came back. Screenshot into `scratch/probes/`, look, then delete it.

- [ ] **Step 2: Check the compact path in the same probe:** under 900px wide the column is a `PanelDrawer`; confirm the strip renders inside the drawer and a task can still be added and advanced.

- [ ] **Step 3: Stamp the release.** `APP_VERSION` to `"1.7.0"` (1.6.7 is what the deployed `/version.json` reports), with one entry at the head of `CHANGELOG`: a headline and at most four player-worded notes about the Tasks tab, the chip, Add from board, and the list being this browser's own.

- [ ] **Step 4: Update `docs/OVERVIEW.md`** with one or two sentences in Workflow 5 (state and persistence): the task list is personal state in localStorage beside the plan, read in the right column's Tasks tab.

- [ ] **Step 5: Run the release tests, then commit**

Run: `npx vitest run src/lib/changelog.test.ts src/lib/whats-new.test.ts && npm run typecheck`
Expected: PASS and clean.

```bash
git add src/lib/version.ts src/lib/changelog.ts docs/OVERVIEW.md
git commit -m "1.7.0: the right column gains a Tasks tab, and a board can be turned into a list to work through"
```

# Task Board design

Closes issue #10, sent from the site's request form on app 1.6.7:

> Task Board system similar to GTNH Planners current one, however much simpler, less features
> needed. Essentially a simple check list system with titles and descriptions that can be moved
> between "Need to be done" "Being done" "done". Its been very useful on gtnhplanner but having
> both sites open is frustrating.

Plus one requirement added during review: the ability to turn the open board into tasks.

## What it is

A personal to-do list with three states, living in the planner's right-hand column beside the
resource panel, so the board stays visible while you read it. It is not part of a plan: it is
the player's own list for the whole browser, the way hidden and starred resources already are
the player's own taste across all designs.

## Decisions

| Question | Choice |
|---|---|
| Who does a task belong to | One board for the whole browser, shared by every design. Not plan JSON, so it never travels through export, import or a shared link. |
| Where it lives | A second tab in the right-hand column, next to Resources. |
| How a task moves | A state chip per row; clicking it advances Need to be done, Being done, Done, then back to the first. No drag anywhere. Newest task first in its column. |
| Where it is stored | localStorage, one JSON blob, read through `useSyncExternalStore`, the pattern `src/lib/workspace-view.ts` already sets. |
| Turning a board into tasks | A button makes one task per machine card. A task remembers the card it came from, so pressing it again adds only what is missing and never resets progress. |

## Data

```ts
// src/lib/tasks/task-board.ts
export type TaskState = "todo" | "doing" | "done";

export interface BoardTask {
  /** randomUUID() from src/lib/random-id.ts. */
  id: string;
  /** Required. Clipped to 120 characters on the way in. */
  title: string;
  /** Optional body. Clipped to 2000 characters on the way in. */
  detail: string;
  state: TaskState;
  /** Epoch ms. The order within a state, newest first. */
  createdAt: number;
  /** Set only by "Add from board": the card this task was made from. */
  source?: { designId: string; designName: string; nodeId: string };
}
```

The whole list is one array under the localStorage key `gtnh-factory-flow-tasks.v1`.

## Storage module

`src/lib/tasks/task-board.ts` is the only door to the list, and it follows
`src/lib/workspace-view.ts` exactly: module state, a listener set, `getSnapshot()` whose identity
is stable between writes (what `useSyncExternalStore` needs), `getServerSnapshot()` returning an
empty list so the prerendered page hydrates without a mismatch, and writes that swallow a full or
blocked quota instead of breaking the board.

Surface:

```ts
useTaskBoard(): BoardTask[]
addTask(title: string, detail?: string): void
setTaskState(id: string, state: TaskState): void
advanceTask(id: string): void          // todo -> doing -> done -> todo
editTask(id: string, patch: { title?: string; detail?: string }): void
deleteTask(id: string): void
clearDoneTasks(): void
addTasksFromBoard(tasks: BoardTask[]): string[]   // returns the ids it added
```

Reads are validated field by field: a task with a usable `id`, a non-empty string `title`, a
known `state` and a finite `createdAt` is kept, and everything else in the blob is dropped. A
corrupt blob costs the tasks that no longer parse, never the whole list and never a crash.

Two tabs on one browser is a case this app already handles for designs, so the module listens for
the `storage` event and re-reads when another tab writes. The whole blob is replaced by whoever
wrote last: a lost edit is one keystroke, not a plan, so there is no compare-and-write here.

## UI

`InspectorPanel` (`src/components/InspectorPanel.tsx:287`) becomes a shell with a two-button strip
at its head, **Resources** and **Tasks**, the latter wearing the count of tasks that are not Done
(Need to be done plus Being done). Resources keeps
exactly what the column renders today (`FlowIOPanel` plus `MachineShoppingList`); Tasks replaces
both with `src/components/tasks/TaskBoardPanel.tsx`.

The chosen tab is personal taste, so it joins `WorkspaceView` as `rightPanelTab`, defaulting to
Resources and persisting like the column's other preferences. On a phone the strip rides inside
the same `<aside>`, so `PanelDrawer` needs no change.

Tasks, top to bottom:

- **Add from board** button.
- An add row: a title input and, under it, an optional single-line detail input. Enter in either
  adds the task to "Need to be done"; a blank title adds nothing.
- Three sections in the order Need to be done, Being done, Done. Each has a heading with its
  count and folds; Done starts folded, the precedent being the resource panel's own folds, where
  the long tail starts closed.
- A row is the state chip, the title, and the detail as a second muted line. Clicking the row
  opens inline editing: a title field, a detail textarea, a three-way state control
  (`setTaskState`) and a delete button. Clicking the chip itself advances the state without
  opening the editor (`advanceTask`); a delete button also appears on the row on hover.
- Done's heading carries **Clear done**.

Every string goes through `t()`, and `ru_RU.ts` and `zh_CN.ts` gain their translations in the same
commit: `i18n-catalogs.test.ts` fails until both catalogs cover the new keys.

## Add from board

One task per machine card, from `buildMachineList` (`src/lib/model/machine-list.ts:57`), which
already gives one entry per card with its handler label, machine count and tier.

- Title: `<label> ×<count>`, with the tier in brackets when the entry has one, e.g.
  `Macerator ×2 (LV)`.
- Detail: `<design name> · <recipe name>`.
- State: "Need to be done", whatever the board's own construction checklist says. The checklist
  ticks what is built on the board; this list is the player's, and one does not drive the other.

Pressing it again is safe. A task whose `source` names a card already in the list is not added
twice, matched on `designId` plus `nodeId`. Existing tasks keep the state the player left them in,
so a task moved to Done stays in Done. A card the player deleted leaves its task behind as a
reminder until the player deletes it. A board with no machine cards adds nothing and says so.

## Rules this feature must not break

- Tasks are personal, not plan data. A shared plan opened read-only (`publicView`) still lets you
  edit your list: the plan is read-only, the list is yours.
- The right column is removed outright in Pool mode and under the Welcome and Library pages
  (`src/components/FactoryPlannerApp.tsx:505`). Tasks are unreachable there, accepted for this
  release rather than re-plumbing the column.
- Nothing here touches the solve. Editing a task never re-solves the board, and the board's
  performance contract is untouched: no new per-frame work, no measurement per edge.
- A plan arriving (import, paste, `#p=` link, community copy) opens as a new design and leaves the
  task list alone.

## Out of scope

Drag to reorder, due dates, priorities, colours, subtasks, per-design boards, a link from a task
to a card, account sync of tasks (Supabase community features are dormant), sharing tasks, and
exporting them with a plan.

## Verification

- `src/lib/tasks/task-board.test.ts`: add, advance, set, edit, delete, clear done; newest-first
  order; the 120 and 2000 character clips; a corrupt blob keeping what parses; a blocked quota
  leaving the in-memory list usable; another tab's `storage` write being picked up.
- `src/lib/tasks/from-board.test.ts`: one task per card; a second press adding nothing; a new card
  adding one task; a deleted card keeping its task; a Done task staying Done; the title and detail
  format; a board with no cards.
- `InspectorPanel.test.tsx`: the tab strip switches content, keeps the choice in the workspace
  view, and shows the open-task count.
- The real app with Playwright, headless, per `AGENTS.md`: unit tests cannot see routing, layering
  or hover. Add a task, advance its chip, switch to Resources and back, press Add from board on a
  plan with cards, reload and confirm the list survived.
- `npm run typecheck` and `npm run test` green.

## Release

`APP_VERSION` goes to 1.7.0 (a feature release; 1.6.7 is live on the deployed site) with one
player-worded entry in `src/lib/changelog.ts`, newest first. `docs/OVERVIEW.md` gains a line about
the task list in the state and persistence workflow.

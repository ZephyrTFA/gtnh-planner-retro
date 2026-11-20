# Tasks pane: shorter state names, rows that fit, a resizable column

## Intent

The Tasks tab is hard to read in the 234px right column. The "NEED TO BE DONE" chip takes 143px
of a row and leaves a title about 64px ("Chemic…"), and the row editor's three state buttons wrap
onto three lines. The owner asked for the pane to be bigger, perhaps resizable, and for the state
names to become "Pending" and "Working" or similar.

## Goals

- A task's title is readable at the column's default width.
- The player can widen the right column, and the width is remembered.
- The states read Pending, Working, Done everywhere they are shown.

Non-goals: a width per tab, resizing the left column, resizing the phone drawers, a version bump.
Anti-goal: a column whose width changes when the tab changes, because that shifts the board.

## Approaches

1. **Short labels and a row that wraps, plus a draggable column width (picked).** Fixes the row at
   every width and lets the player have more room when they want it.
2. **Only widen the column to a larger fixed width.** Takes board space from everyone, including
   players who never open Tasks, and the long chip still dominates the row.
3. **A wider column only while Tasks is open.** The board jumps sideways on every tab switch.

The owner approved approach 1.

## Design

**Labels.** `todo` shows as "Pending", `doing` as "Working", `done` stays "Done": section headings,
the row chip, the editor's three-way control. The stored state ids do not change, so saved lists
load as they are. `ru_RU.ts` and `zh_CN.ts` gain the two new keys and drop the two old ones. The
1.7.0 changelog line and the task board spec name the new labels.

**Rows.** The title wraps to at most two lines instead of truncating to one; the detail stays one
muted truncated line. The editor's state buttons sit on one line at the default width.

**Column width.** `WorkspaceView` gains `rightPanelWidth` (shell px), default 234, clamped to
234..520 on read and on write. A drag handle on the column's left edge sets it; double-click
returns it to 234. The handle is the visible control the persisted setting needs. The pointer
delta is real px and the width is shell px, so the delta is divided by `getUiScale()`. The grid
column and `--toolbar-hidden-panel-width` read the stored width where they read 234 today. The
width is one value for both tabs. Compact mode keeps its drawer and its 234 cap, and shows no
handle.

## Left to the builder (my calls)

- The 520px cap, and the handle's exact look (a thin strip that lights on hover, `col-resize`).
- Whether the drag writes storage on every move or only on release; the board must not re-solve
  or rebuild either way.
- Keyboard: arrow keys on the focused handle step the width.

## Checks

- `TaskBoardPanel.test.tsx`, `task-board.test.ts`, `InspectorPanel.test.tsx`, a workspace-view
  test for the clamp, `i18n-catalogs.test.ts`.
- Playwright on the static build: rows at 234px, drag wider, reload keeps the width, double-click
  resets, Resources tab still lays out at both widths, phone drawer unchanged.

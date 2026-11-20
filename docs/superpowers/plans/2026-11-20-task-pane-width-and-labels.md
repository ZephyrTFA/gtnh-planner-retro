# Tasks Pane Width and Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task states read Pending, Working, Done; a task title is readable in the default column; the right column can be dragged wider and remembers its width.

**Architecture:** The label and row changes are local to `TaskBoardPanel.tsx` and the two catalogs. The width is a new `WorkspaceView` field, clamped in `workspace-view.ts`. A new `PanelResizeHandle` component sits on the right column's left edge in `ColumnWorkspace`; while dragging it writes a CSS variable on the grid directly, and it commits the width to the workspace view on release, so a drag re-renders nothing but the layout.

**Tech Stack:** Next.js, React, TypeScript strict, Tailwind, Vitest with Testing Library, Playwright for the real app.

**Spec:** `docs/superpowers/specs/2026-11-20-task-pane-width-and-labels-design.md`

## Global Constraints

- Stored task state ids (`todo`, `doing`, `done`) do not change.
- Column width is shell px: default 234, minimum 234, maximum 520, one value for both tabs.
- Compact mode keeps its drawer and its 234 cap, and shows no handle.
- Pointer coordinates are real px; divide a pointer delta by `getUiScale()` before it becomes a width.
- Every player-facing string goes through `t()`, with `ru_RU.ts` and `zh_CN.ts` in the same commit.
- Copy is plain and short, no em dashes. Comments state the rule and why, no history.
- No version bump. No deploy. No push.
- Dragging must not re-solve, and must not re-render the board per pointer move.

## Review Focus

1. A stored wide column on a narrow desktop window (900 to 1100px): the board keeps at least 320px. Pinned in Task 3 (grid `min()`), checked in Task 4.
2. A hand-edited or stale `rightPanelWidth` (a string, `NaN`, 10, 9999, missing): reads as a width inside 234..520. Pinned in Task 2.
3. Interface scale other than 100%: the column edge follows the pointer one for one. Checked in Task 4 at 150%.
4. A drag that ends off the handle or is cancelled (`pointercancel`, release outside the window): the handle lets go and the width is kept, never stuck following the pointer. Pinned in Task 3.
5. The Resources tab and Pool mode at a wide column: resource rows, the hover copy of a row and the toolbar fold still lay out. Checked in Task 4.

---

### Task 1: Pending, Working, and rows that fit

**Files:**
- Modify: `src/components/tasks/TaskBoardPanel.tsx` (`stateLabel`, `TaskRow` title span)
- Modify: `src/components/tasks/TaskBoardPanel.test.tsx`
- Modify: `src/lib/i18n/ru_RU.ts`, `src/lib/i18n/zh_CN.ts`
- Modify: `src/lib/tasks/task-board.ts:209` (comment), `src/lib/changelog.ts` (1.7.0 second note), `docs/superpowers/specs/2026-11-19-task-board-design.md`, `docs/superpowers/plans/2026-11-19-task-board.md` (label names only)

- [ ] **Step 1: Change the tests to the new names.** In `TaskBoardPanel.test.tsx`, every `"Need to be done"` becomes `"Pending"` and every `"Being done"` becomes `"Working"`, the test title on line 81 included. Add:

```tsx
it("names the three sections Pending, Working and Done", () => {
  addTask("Build the pump");
  render(<TaskBoardPanel />);
  expect(within(section("todo")).getByText("Pending")).toBeTruthy();
  expect(within(section("doing")).getByText("Working")).toBeTruthy();
  expect(within(section("done")).getByText("Done")).toBeTruthy();
});
```

(Match the file's existing helpers and assertion style; `getAllByText` if the chip repeats the name.)

- [ ] **Step 2: Run** `npx vitest run src/components/tasks/TaskBoardPanel.test.tsx`. Expected: FAIL, "Pending" not found.

- [ ] **Step 3: Implement.** `stateLabel` returns `t("Working")` for `doing` and `t("Pending")` for `todo`. In `TaskRow`, the title span swaps `truncate` for `line-clamp-2 break-words`; the detail span keeps `truncate`. Catalogs: remove the `"Being done"` and `"Need to be done"` keys; add `"Pending"`: `"Ожидает"` / `"待办"` and `"Working"`: `"В работе"` / `"进行中"`.

- [ ] **Step 4: Update the prose.** The comment at `task-board.ts:209`, the 1.7.0 changelog note ("from Pending to Working to Done"), and the label names in the 2026-11-19 spec and plan.

- [ ] **Step 5: Run** `npx vitest run src/components/tasks src/lib/tasks src/lib/i18n` and `grep -rn "Need to be done\|Being done" src docs`. Expected: PASS; grep prints only the owner's quoted request in the 2026-11-19 spec (line 7) and this plan and its spec.

- [ ] **Step 6: Commit.** `Task states read Pending, Working, Done, and a task title wraps to two lines instead of cutting off`

### Task 2: The column width is a workspace preference

**Files:**
- Modify: `src/lib/workspace-view.ts`
- Test: `src/lib/workspace-view.test.ts`

**Interfaces:**
- Produces:
  - `export const RIGHT_PANEL_MIN_WIDTH = 234; export const RIGHT_PANEL_MAX_WIDTH = 520;`
  - `export function clampRightPanelWidth(value: unknown): number` (a non-finite or non-number value gives 234; otherwise rounded and clamped to 234..520)
  - `WorkspaceView.rightPanelWidth: number` (shell px, default 234)
  - `export function setRightPanelWidth(width: number): void` (clamps, then `writeWorkspaceView`)

- [ ] **Step 1: Write the failing tests** in a new `describe("the right column's width")`, following the "right column's tab" block's way of seeding storage and re-importing the module:

```ts
it("clamps anything stored to the column's range", () => {
  expect(clampRightPanelWidth(300.4)).toBe(300);
  expect(clampRightPanelWidth(10)).toBe(234);
  expect(clampRightPanelWidth(9999)).toBe(520);
  expect(clampRightPanelWidth("400")).toBe(234);
  expect(clampRightPanelWidth(Number.NaN)).toBe(234);
  expect(clampRightPanelWidth(undefined)).toBe(234);
});
it("defaults to 234 when the blob predates the width", async () => { /* seed {} , expect snapshot.rightPanelWidth 234 */ });
it("reads a stored width through the clamp", async () => { /* seed { rightPanelWidth: 9999 }, expect 520 */ });
it("stores a clamped width", () => {
  setRightPanelWidth(100);
  expect(current().rightPanelWidth).toBe(234);
  setRightPanelWidth(412);
  expect(current().rightPanelWidth).toBe(412);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/workspace-view.test.ts`. Expected: FAIL, `clampRightPanelWidth` is not exported.
- [ ] **Step 3: Implement** the four items in Interfaces; `readWorkspaceView` reads `rightPanelWidth` through the clamp; `DEFAULT_WORKSPACE_VIEW.rightPanelWidth` is `RIGHT_PANEL_MIN_WIDTH`.
- [ ] **Step 4: Run** `npx vitest run src/lib/workspace-view.test.ts src/lib/plan-view-apply.test.ts` and `npm run typecheck`. Expected: PASS (typecheck names any `WorkspaceView` literal that now lacks the field; give it 234).
- [ ] **Step 5: Commit.** `The right column's width joins the workspace preferences, clamped to 234..520 on the way in and out`

### Task 3: The drag handle and the grid

**Files:**
- Create: `src/components/PanelResizeHandle.tsx`
- Test: `src/components/PanelResizeHandle.test.tsx`
- Modify: `src/components/FactoryPlannerApp.tsx` (`ColumnWorkspace`)
- Modify: `src/lib/i18n/ru_RU.ts`, `src/lib/i18n/zh_CN.ts`
- Modify: `src/components/CLAUDE.md` (Inspector and panels: the width rule)

**Interfaces:**
- Consumes: Task 2's exports; `getUiScale` from `@/lib/ui-scale`.
- Produces: `export function PanelResizeHandle(props: { width: number; onPreview: (width: number) => void }): JSX.Element`. `onPreview` receives each clamped width during a drag so the owner can paint it without a store write.

Behaviour:
- A `role="separator"`, `aria-orientation="vertical"`, `tabIndex={0}`, `data-panel-resize` strip, 6px wide, absolutely placed on the column's left edge, `cursor-col-resize`, `touch-none`, lit on hover and while dragging. `aria-valuemin` 234, `aria-valuemax` 520, `aria-valuenow` the width. `title` and `aria-label`: `t("Drag to resize. Double-click to reset.")` (RU `"Потяните, чтобы изменить ширину. Двойной щелчок сбрасывает."`, ZH `"拖动调整宽度，双击重置。"`).
- Pointer down captures the pointer and records `clientX` and the starting width. Each move calls `onPreview(clampRightPanelWidth(start + (startX - clientX) / getUiScale()))`: dragging left widens. Pointer up and `pointercancel` both end the drag and call `setRightPanelWidth` with the last previewed width.
- Double-click: `setRightPanelWidth(RIGHT_PANEL_MIN_WIDTH)`.
- ArrowLeft adds 16, ArrowRight takes 16, both through `setRightPanelWidth`.

`ColumnWorkspace`:
- `<main>` carries `--right-panel-width: <workspace.rightPanelWidth>px` in its style. The third grid track, when the column is shown, is `max(234px, min(var(--right-panel-width), calc(100% - 256px - 320px)))`, so a narrow window keeps 320px of board. `--toolbar-hidden-panel-width` uses `workspace.rightPanelWidth` where it uses 234.
- `onPreview` sets `--right-panel-width` on the `<main>` element through a ref. No React state changes per move.
- The shown column is `<div className="relative h-full min-h-0 min-w-0"><PanelResizeHandle … /><InspectorPanel /></div>`. `CompactWorkspace` is untouched.

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`; `getUiScale()` is 1 there). If jsdom drops `clientX` from pointer events, build them as `new MouseEvent("pointerdown", { clientX, bubbles: true })`.

```tsx
it("widens the column as the handle is dragged left, and stores it on release", () => {
  const onPreview = vi.fn();
  render(<PanelResizeHandle width={234} onPreview={onPreview} />);
  const handle = screen.getByRole("separator");
  pointer(handle, "pointerdown", 500);
  pointer(handle, "pointermove", 400);
  expect(onPreview).toHaveBeenLastCalledWith(334);
  pointer(handle, "pointerup", 400);
  expect(stored().rightPanelWidth).toBe(334);
});
it("stops at the column's limits", () => { /* drag to clientX -2000 previews 520; drag to 2000 previews 234 */ });
it("keeps the width and lets go when the drag is cancelled", () => {
  /* down 500, move 450, pointercancel: stored 284; a later pointermove calls onPreview no more */
});
it("returns to 234 on a double click", () => { /* seed 400, dblClick, stored 234 */ });
it("steps 16 with the arrow keys", () => { /* width 300: ArrowLeft stores 316, ArrowRight from 300 stores 284 */ });
```

- [ ] **Step 2: Run** `npx vitest run src/components/PanelResizeHandle.test.tsx`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `PanelResizeHandle` and the catalog entries.
- [ ] **Step 4: Wire `ColumnWorkspace`** as described, and update the width sentence in `src/components/CLAUDE.md`: default 234 shell px, draggable to 520 from its left edge (`PanelResizeHandle`, stored as `rightPanelWidth`), drawers keep the 234 cap, pinned by `PanelResizeHandle.test.tsx` and the width block of `workspace-view.test.ts`.
- [ ] **Step 5: Run** `npx vitest run src/components/PanelResizeHandle.test.tsx src/lib/i18n` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.** `The right column drags wider from its left edge, up to 520px, and a double click returns it to 234`

### Task 4: The real app

**Files:**
- Modify: `scratch/probes/task-pane-look.mjs` (gitignored)

- [ ] **Step 1:** `npm run build`, serve `out/` on 8081.
- [ ] **Step 2: Extend the probe** to print and assert, at 1600x1000:
  - at 234px: the first row's title is at least 130px wide, and each editor state button is one line tall (height under 24px);
  - dragging `[data-panel-resize]` 150px left makes the `aside` 150 real px wider (within 2px); the board's `.react-flow` box narrows by the same amount; no page errors;
  - after reload the `aside` has the same width; double-click returns it to the starting width;
  - with interface scale 150% (set through the app's own setting key, see `src/lib/ui-scale.ts`), a 100px drag moves the column's left edge 100 real px (within 2px);
  - at a 1000x800 viewport with a stored width of 520, `.react-flow` is at least 320 shell px wide;
  - Resources tab at 520px: screenshot, look, delete; Pool mode on and off leaves the toolbar unfolded as before;
  - at 780x620 (compact) there is no `[data-panel-resize]` and the drawer is 234 wide.
- [ ] **Step 3: Run the probe**, look at the screenshots, delete them.
- [ ] **Step 4: Run** `npm run typecheck && npm run test`. Expected: both green.
- [ ] **Step 5: Commit** anything the probe made you fix, with a message that says what and why.

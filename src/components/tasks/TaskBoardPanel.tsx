"use client";

import { useState } from "react";
import { Check, CircleDashed, ListTodo, Plus, Trash2 } from "lucide-react";
import { tPlural, useT } from "@/lib/i18n";
import { boardTasksToAdd } from "@/lib/tasks/from-board";
import {
  addTask,
  addTasksFromBoard,
  advanceTask,
  clearDoneTasks,
  deleteTask,
  editTask,
  setTaskState,
  TASK_STATE_ORDER,
  useTaskBoard,
  type BoardTask,
  type TaskState,
} from "@/lib/tasks/task-board";
import { useFactoryStore } from "@/store/factory-store";

/**
 * The player's own task list, in the right column beside the board.
 *
 * Three sections, newest first, and a chip that walks a task through them.
 * Nothing here is plan data: the list is the same whatever design is open, it
 * survives a read-only plan someone else posted, and it never re-solves.
 */
export function TaskBoardPanel() {
  const t = useT();
  const tasks = useTaskBoard();
  const project = useFactoryStore((state) => state.project);
  const result = useFactoryStore((state) => state.lastResult);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<string>();
  // Done starts shut: it is the long tail of a list, the same way the resource
  // panel starts with its internal section shut.
  const [open, setOpen] = useState<Record<TaskState, boolean>>({
    todo: true,
    doing: true,
    done: false,
  });
  const [editingId, setEditingId] = useState<string>();

  const submit = () => {
    if (!title.trim()) {
      return;
    }
    addTask(title, detail);
    setTitle("");
    setDetail("");
    setStatus(undefined);
  };

  const fromBoard = () => {
    const added = addTasksFromBoard(boardTasksToAdd(project, result));
    setStatus(
      added.length > 0
        ? tPlural(added.length, "{count} task added", "{count} tasks added", {
            count: added.length,
          })
        : t("Nothing new to add from this board."),
    );
  };

  const total = tasks.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col text-[12px] text-[var(--mc-ink)]" data-task-panel>
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--mc-33)] px-2 py-1.5">
        <button
          type="button"
          data-task-add-from-board
          onClick={fromBoard}
          className="inline-flex items-center gap-1 rounded border border-[var(--mc-55)] bg-[var(--mc-25)] px-2 py-1 hover:bg-[var(--mc-55)]"
        >
          <ListTodo className="h-3.5 w-3.5" aria-hidden />
          {t("Add from board")}
        </button>
        {status ? (
          <span data-task-status className="truncate text-[11px] text-[var(--mc-ink-muted)]">
            {status}
          </span>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-[var(--mc-33)] px-2 py-1.5">
        <input
          data-task-new-title
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submit();
            }
          }}
          placeholder={t("New task")}
          aria-label={t("New task")}
          className="w-full rounded border border-[var(--mc-33)] bg-[#101215] px-2 py-1 outline-none focus:border-[var(--mc-ink-muted)]"
        />
        <input
          data-task-new-detail
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submit();
            }
          }}
          placeholder={t("Detail (optional)")}
          aria-label={t("Detail (optional)")}
          className="mt-1 w-full rounded border border-[var(--mc-33)] bg-[#101215] px-2 py-1 text-[11px] text-[var(--mc-ink-muted)] outline-none focus:border-[var(--mc-ink-muted)]"
        />
      </div>

      {total === 0 ? (
        <p data-task-empty className="px-3 py-3 text-[11px] text-[var(--mc-ink-muted)]">
          {t("No tasks yet. Add one above, or turn the board into a list.")}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {TASK_STATE_ORDER.map((state) => (
            <TaskSection
              key={state}
              state={state}
              tasks={tasks.filter((task) => task.state === state)}
              open={open[state]}
              editingId={editingId}
              onToggleOpen={() => setOpen((current) => ({ ...current, [state]: !current[state] }))}
              onEdit={(id) => setEditingId((current) => (current === id ? undefined : id))}
              onEditDone={(id) => setEditingId((current) => (current === id ? undefined : current))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The chip's face: the state a task is in, and the way to the next one. */
function stateLabel(state: TaskState, t: (key: string) => string): string {
  if (state === "done") {
    return t("Done");
  }
  return state === "doing" ? t("Working") : t("Pending");
}

function TaskSection({
  state,
  tasks,
  open,
  editingId,
  onToggleOpen,
  onEdit,
  onEditDone,
}: {
  state: TaskState;
  tasks: BoardTask[];
  open: boolean;
  editingId?: string;
  onToggleOpen: () => void;
  onEdit: (id: string) => void;
  onEditDone: (id: string) => void;
}) {
  const t = useT();
  const Icon = state === "done" ? Check : state === "doing" ? CircleDashed : Plus;
  return (
    <section data-task-section={state} className="border-b border-[var(--mc-33)]">
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          data-task-fold={state}
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mc-ink-muted)] hover:text-[var(--mc-ink)]"
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{stateLabel(state, t)}</span>
          <span className="rounded bg-[var(--mc-55)] px-1 text-[10px] font-medium tabular-nums">
            {tasks.length}
          </span>
        </button>
        {state === "done" && tasks.length > 0 ? (
          <button
            type="button"
            onClick={clearDoneTasks}
            className="shrink-0 rounded px-1 text-[10px] text-[var(--mc-ink-muted)] hover:bg-[var(--mc-55)] hover:text-[var(--mc-ink)]"
          >
            {t("Clear done")}
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="flex flex-col gap-1 px-2 pb-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              editing={editingId === task.id}
              onEdit={onEdit}
              onEditDone={onEditDone}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TaskRow({
  task,
  editing,
  onEdit,
  onEditDone,
}: {
  task: BoardTask;
  editing: boolean;
  onEdit: (id: string) => void;
  onEditDone: (id: string) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const label = stateLabel(task.state, t);

  const commit = () => {
    if (title.trim() !== task.title || detail !== task.detail) {
      editTask(task.id, { title, detail });
    }
    if (!title.trim()) {
      onEditDone(task.id);
    }
  };

  return (
    <li
      data-task-row
      className="group flex flex-col gap-1 rounded border border-[var(--mc-33)] bg-[#101215] px-2 py-1.5"
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => advanceTask(task.id)}
          title={t("Move to the next state")}
          className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            task.state === "done"
              ? "border-emerald-800 bg-emerald-950 text-emerald-300"
              : task.state === "doing"
                ? "border-amber-800 bg-amber-950 text-amber-300"
                : "border-[var(--mc-55)] bg-[var(--mc-25)] text-[var(--mc-ink-muted)]"
          }`}
        >
          {label}
        </button>
        <button
          type="button"
          onClick={() => onEdit(task.id)}
          className="min-w-0 flex-1 text-left leading-snug hover:underline"
        >
          <span data-task-title-text className="line-clamp-2 break-words">
            {task.title}
          </span>
          {task.detail ? (
            <span className="block truncate text-[10px] text-[var(--mc-ink-muted)]">
              {task.detail}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => deleteTask(task.id)}
          aria-label={t("Delete")}
          title={t("Delete")}
          className="shrink-0 text-[var(--mc-ink-muted)] opacity-0 hover:text-[var(--mc-ink)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {editing ? (
        <div data-testid="task-editor" className="flex flex-col gap-1 border-t border-[var(--mc-33)] pt-1.5">
          <input
            data-testid="task-edit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commit();
              }
            }}
            aria-label={t("Task title")}
            className="w-full rounded border border-[var(--mc-33)] bg-[#0b0c0e] px-1.5 py-1 outline-none"
          />
          <textarea
            data-testid="task-edit-detail"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            onBlur={commit}
            rows={2}
            aria-label={t("Detail")}
            className="w-full resize-y rounded border border-[var(--mc-33)] bg-[#0b0c0e] px-1.5 py-1 text-[11px] text-[var(--mc-ink-muted)] outline-none"
          />
          <div className="flex items-center gap-1">
            {TASK_STATE_ORDER.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setTaskState(task.id, state)}
                aria-pressed={task.state === state}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  task.state === state
                    ? "bg-[var(--mc-55)] text-[var(--mc-ink)]"
                    : "text-[var(--mc-ink-muted)] hover:bg-[var(--mc-25)]"
                }`}
              >
                {stateLabel(state, t)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                deleteTask(task.id);
                onEditDone(task.id);
              }}
              className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-950"
            >
              {t("Delete")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

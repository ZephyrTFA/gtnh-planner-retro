"use client";

import { Component, type ReactNode } from "react";

/**
 * A plan that throws while the board draws it shows this instead of a white
 * page. The way out never needs the plan: the library (closing the design
 * that failed) or a reload in safe mode, which opens nothing.
 */
export class BoardErrorBoundary extends Component<
  { children: ReactNode; onOpenLibrary: () => void; resetKey?: string },
  { error?: Error; resetKey?: string }
> {
  state: { error?: Error; resetKey?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: string },
    state: { error?: Error; resetKey?: string },
  ) {
    // Another design on the board is another chance.
    if (props.resetKey !== state.resetKey) {
      return { error: undefined, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    console.error("The board failed to draw this plan.", error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <BoardRecovery
        message={this.state.error.message}
        onOpenLibrary={() => {
          this.setState({ error: undefined });
          this.props.onOpenLibrary();
        }}
      />
    );
  }
}

export function BoardRecovery({ message, onOpenLibrary }: { message?: string; onOpenLibrary?: () => void }) {
  return (
    <div role="alert" className="flex h-full w-full items-center justify-center bg-[#15171b] p-6">
      <div className="max-w-[520px] rounded border border-red-800 bg-[#1f1416] p-5 text-sm text-neutral-200 shadow-xl">
        <h2 className="mb-2 text-base font-semibold text-red-200">This plan could not be drawn.</h2>
        <p className="mb-3 text-neutral-300">
          Your other plans are safe. Open the library to pick another one, or reload in safe mode to start
          without opening any plan.
        </p>
        {message ? <p className="mb-4 break-words font-mono text-xs text-neutral-500">{message.slice(0, 300)}</p> : null}
        <div className="flex flex-wrap gap-2">
          {onOpenLibrary ? (
            <button
              type="button"
              onClick={onOpenLibrary}
              className="rounded border border-cyan-700 bg-cyan-700 px-3 py-1.5 font-medium text-white hover:bg-cyan-600"
            >
              Open the library
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              window.location.href = `${window.location.origin}/#safe`;
              window.location.reload();
            }}
            className="rounded border border-neutral-600 px-3 py-1.5 text-neutral-200 hover:bg-neutral-800"
          >
            Reload in safe mode
          </button>
        </div>
      </div>
    </div>
  );
}

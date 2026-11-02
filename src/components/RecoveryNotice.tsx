"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import {
  getRecoveryNotice,
  setRecoveryNotice,
  subscribeRecoveryNotice,
  type RecoveryNotice as Notice,
} from "@/lib/designs/open-guard";

/** Why the library opened instead of the last plan (open-guard.ts). */
export function recoveryNoticeText(notice: Notice): string {
  if (notice.kind === "safe") {
    return "Safe mode: no plan was opened. Open one from your library when you're ready.";
  }
  const name = notice.designName ? `"${notice.designName}"` : "This plan";
  return `${name} didn't finish opening last time, so it was left closed. It's in your library: open it to try again. If the site won't load at all, add #safe to the address to start without opening any plan.`;
}

export function RecoveryNotice() {
  const notice = useSyncExternalStore(subscribeRecoveryNotice, getRecoveryNotice, () => undefined);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 top-12 z-[120] flex max-w-[640px] -translate-x-1/2 items-start gap-3 rounded border border-amber-600 bg-[#2a2113] px-4 py-3 text-sm text-amber-100 shadow-xl"
    >
      <span>{recoveryNoticeText(notice)}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setRecoveryNotice(undefined)}
        className="shrink-0 rounded p-0.5 text-amber-200 hover:bg-amber-900/50 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

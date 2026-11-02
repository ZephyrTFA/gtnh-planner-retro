/**
 * A plan that crashes the page while opening must not crash it again on the
 * next visit. The design being opened is marked in localStorage BEFORE it
 * reaches the board, and becomes the remembered design (the one the next visit
 * reopens) only after it has painted once and the page has had an idle
 * moment. A marker still there at boot means that design never finished
 * opening: the app lands on the library instead, with a notice, and leaves it
 * closed.
 *
 * `#safe` or `?safe` in the address opens no design at all, for when even the
 * library is not enough to get back in.
 */

const OPENING_KEY = "gtnh-retro.opening-design.v1";

let openingToken = 0;

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Marks `designId` as opening and calls `settled` once it has painted and the
 * page has been idle. A newer opening supersedes an older one: only the latest
 * settles.
 */
export function beginDesignOpening(designId: string, settled: () => void): void {
  const token = ++openingToken;
  try {
    storage()?.setItem(OPENING_KEY, designId);
  } catch {
    // Storage full or blocked: the guard is best effort.
  }
  afterPaintAndIdle(() => {
    if (token !== openingToken) return;
    try {
      if (storage()?.getItem(OPENING_KEY) === designId) storage()?.removeItem(OPENING_KEY);
    } catch {
      // As above.
    }
    settled();
  });
}

/** The design that was opening when the page last went away, if any; reading clears it. */
export function takeUnfinishedOpening(): string | undefined {
  try {
    const id = storage()?.getItem(OPENING_KEY) ?? undefined;
    if (id) storage()?.removeItem(OPENING_KEY);
    return id;
  } catch {
    return undefined;
  }
}

/** `#safe` or `?safe`: open no design this visit. */
export function isSafeModeAddress(location: Pick<Location, "hash" | "search"> | undefined = typeof window === "undefined" ? undefined : window.location): boolean {
  if (!location) return false;
  const hash = location.hash.replace(/^#/, "");
  return hash === "safe" || new URLSearchParams(location.search).has("safe");
}

/** Idle callbacks in a row, each with this much time to spare, before a plan counts as opened. */
const SETTLED_IDLE_STREAK = 3;
const SETTLED_IDLE_MS = 20;
const SETTLED_IDLE_SPACING_MS = 500;

/**
 * After the first paint, waits until the page is really idle: several idle
 * callbacks in a row, spaced apart, each with time to spare. A plan that keeps
 * the page busy after it paints (routing, solving thousands of cards) does not
 * count as opened until that work is done; if the tab dies first, the marker
 * stays and the next visit recovers. No timeout: a forced callback in a busy
 * page is exactly what must not count.
 */
function afterPaintAndIdle(callback: () => void): void {
  type IdleDeadline = { timeRemaining: () => number };
  const ric = (globalThis as { requestIdleCallback?: (cb: (deadline: IdleDeadline) => void) => number })
    .requestIdleCallback;
  const idle = () => {
    if (!ric) {
      setTimeout(callback, SETTLED_IDLE_SPACING_MS);
      return;
    }
    let streak = 0;
    const check = (deadline: IdleDeadline) => {
      streak = deadline.timeRemaining() >= SETTLED_IDLE_MS ? streak + 1 : 0;
      if (streak >= SETTLED_IDLE_STREAK) {
        callback();
        return;
      }
      setTimeout(() => ric(check), SETTLED_IDLE_SPACING_MS);
    };
    ric(check);
  };
  // A hidden tab never runs animation frames; it still renders.
  if (typeof requestAnimationFrame !== "function" || (typeof document !== "undefined" && document.hidden)) {
    setTimeout(idle, 0);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(idle, 0)));
}

// --- The notice the library shows after a recovery or in safe mode. ---

export type RecoveryNotice =
  | { kind: "unfinished"; designName?: string }
  | { kind: "safe" };

let notice: RecoveryNotice | undefined;
const listeners = new Set<() => void>();

export function setRecoveryNotice(next: RecoveryNotice | undefined): void {
  notice = next;
  for (const listener of listeners) listener();
}

export function getRecoveryNotice(): RecoveryNotice | undefined {
  return notice;
}

export function subscribeRecoveryNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

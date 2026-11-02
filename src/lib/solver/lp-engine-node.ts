import type { HighsInstance } from "./lp-engine";

/**
 * HiGHS for tests and any Node-side solve: the package loads its own wasm
 * from disk. Kept out of lp-engine.ts so the browser bundle never carries the
 * package's Node build.
 */
export async function loadNodeHighs(wasmUrl?: string): Promise<HighsInstance> {
  const factory = (await import("highs")).default;
  return (await factory(wasmUrl ? { locateFile: () => wasmUrl } : undefined)) as unknown as HighsInstance;
}

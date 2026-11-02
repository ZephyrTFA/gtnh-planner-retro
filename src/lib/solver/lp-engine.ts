import { solveLp, type LinearProgram, type LpSolution } from "./simplex";

/**
 * The LP engine switchboard: HiGHS (MIT, WASM) behind the homegrown solver's
 * exact interface. The homegrown dense simplex re-walks the whole tableau for
 * every staged solve, so boards with many fairness stages pay seconds for
 * what HiGHS answers in milliseconds.
 *
 * Nothing switches until `initLpEngine` is awaited: the solve worker calls
 * it at startup, while the main thread, SSR and the test suite keep the
 * synchronous homegrown path. The stage chain locks each objective VALUE,
 * not its vertex, so the two engines agree on the books wherever the answer
 * is determined (an equivalence test pins this). Any load or solve failure
 * falls back to the homegrown engine, never to a missing answer.
 */

export interface HighsInstance {
  solve: (lpText: string) => {
    Status: string;
    Columns: Record<string, { Primal: number }>;
  };
}

let highs: HighsInstance | undefined;
let loading: Promise<boolean> | undefined;

/**
 * Switches to HiGHS once `load` delivers it: `loadWorkerHighs` in the solve
 * worker, `loadNodeHighs` (lp-engine-node.ts) in tests. The Node loader lives
 * in its own module so the browser bundle never carries the package's Node
 * build.
 */
export function initLpEngine(load: () => Promise<HighsInstance>): Promise<boolean> {
  loading ??= (async () => {
    try {
      highs = await load();
      return true;
    } catch (error) {
      console.error("HiGHS failed to load; the homegrown simplex stays on.", error);
      return false;
    }
  })();
  return loading;
}

type HighsFactory = (options?: { locateFile?: (file: string) => string }) => Promise<HighsInstance>;

/**
 * The worker loads the emscripten glue from public/ as a classic script
 * (importScripts), so the glue stays byte-identical to the package's build
 * and nothing is evaluated from a string: the page's CSP allows no eval. The
 * glue is UMD: with no module system in scope it leaves its factory in a
 * global `Module`.
 */
export async function loadWorkerHighs(glueUrl: string, wasmUrl?: string): Promise<HighsInstance> {
  const scope = globalThis as unknown as { importScripts?: (...urls: string[]) => void; Module?: HighsFactory };
  if (typeof scope.importScripts !== "function") {
    throw new Error("HiGHS loads in a worker only.");
  }
  scope.importScripts(glueUrl);
  const factory = scope.Module;
  if (typeof factory !== "function") {
    throw new Error(`${glueUrl} did not define the HiGHS factory.`);
  }
  return factory(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
}

export function activeLpEngine(): "highs" | "simplex" {
  return highs ? "highs" : "simplex";
}

export function solveLpAuto(lp: LinearProgram): LpSolution {
  if (highs) {
    try {
      return solveWithHighs(highs, lp);
    } catch (error) {
      console.error("HiGHS solve failed; falling back to the homegrown simplex.", error);
    }
  }
  return solveLp(lp);
}

function solveWithHighs(instance: HighsInstance, lp: LinearProgram): LpSolution {
  const n = lp.maximize.length;
  // Port rows divide by throughput, so late-game flows can have coefficients
  // below HiGHS' small-matrix cutoff. Change variable units before handing
  // those rows to it: x = columnScale * y. This preserves the same equations
  // and objective instead of letting the engine discard a real flow term.
  const columnScale = new Array<number>(n).fill(1);
  for (const row of [...lp.equalities, ...lp.upperBounds]) {
    for (const [c, value] of row.coefficients) {
      if (value !== 0 && Math.abs(value) < 1e-8) {
        columnScale[c] = Math.max(columnScale[c]!, 1 / Math.abs(value));
      }
    }
  }
  const scaledObjective = lp.maximize.map((value, c) => value * columnScale[c]!);
  const objectiveScale = Math.max(1, ...scaledObjective.map(Math.abs));
  const scaledRow = (row: LinearProgram["equalities"][number]) => {
    const coefficients = new Map([...row.coefficients].map(([c, value]) => [c, value * columnScale[c]!]));
    const scale = Math.max(1, ...[...coefficients.values()].map(Math.abs));
    return { coefficients: new Map([...coefficients].map(([c, value]) => [c, value / scale])), rhs: row.rhs / scale };
  };

  const term = (value: number, index: number) =>
    `${value < 0 ? "- " : "+ "}${format(Math.abs(value))} x${index}`;
  const lines: string[] = ["Maximize", ""];
  const objTerms: string[] = [];
  for (let c = 0; c < n; c += 1) {
    const v = scaledObjective[c]! / objectiveScale;
    if (v !== 0) {
      objTerms.push(term(v, c));
    }
  }
  lines[1] = ` obj: ${objTerms.length > 0 ? objTerms.join(" ") : "0 x0"}`;
  lines.push("Subject To");
  let rowIndex = 0;
  for (const originalRow of lp.equalities) {
    const row = scaledRow(originalRow);
    const terms: string[] = [];
    for (const [c, v] of row.coefficients) {
      if (v !== 0) {
        terms.push(term(v, c));
      }
    }
    if (terms.length === 0) {
      continue;
    }
    lines.push(` e${rowIndex}: ${terms.join(" ")} = ${format(row.rhs)}`);
    rowIndex += 1;
  }
  for (const originalRow of lp.upperBounds) {
    const row = scaledRow(originalRow);
    const terms: string[] = [];
    for (const [c, v] of row.coefficients) {
      if (v !== 0) {
        terms.push(term(v, c));
      }
    }
    if (terms.length === 0) {
      continue;
    }
    lines.push(` u${rowIndex}: ${terms.join(" ")} <= ${format(row.rhs)}`);
    rowIndex += 1;
  }
  lines.push("End");

  const solved = instance.solve(lines.join("\n"));
  if (solved.Status !== "Optimal") {
    const status = solved.Status === "Infeasible" ? ("infeasible" as const) : ("unbounded" as const);
    return { status, x: [], objective: Number.NaN };
  }
  const x = new Array<number>(n).fill(0);
  for (let c = 0; c < n; c += 1) {
    x[c] = (solved.Columns[`x${c}`]?.Primal ?? 0) * columnScale[c]!;
  }
  let objective = 0;
  for (let c = 0; c < n; c += 1) {
    objective += lp.maximize[c]! * x[c]!;
  }
  return { status: "optimal", x, objective };
}

/** HiGHS accepts scientific notation; retain small nonzero coefficients. */
function format(value: number): string {
  return String(value);
}

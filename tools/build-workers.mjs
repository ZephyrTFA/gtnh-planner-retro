#!/usr/bin/env node
// Bundles the app's Web Workers into public/workers/ (gitignored) before
// `next dev` and `next build`. Turbopack copies the target of
// `new Worker(new URL("./x.worker.ts", import.meta.url))` as a raw .ts asset
// instead of bundling it, so a worker started that way never runs. The app
// starts workers by plain URL instead (src/lib/worker-url.ts).
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const outDir = path.join(root, "public", "workers");

/** Worker name (its URL under /workers/) -> entry file. Keep in step with worker-url.ts. */
const WORKERS = {
  "solve-books": "src/store/solve-books.worker.ts",
  "arrange": "src/lib/arrange.worker.ts",
  "grid-route": "src/components/flow/grid-route.worker.ts",
  "dataset": "src/lib/dataset-engine/dataset.worker.ts",
};

await build({
  entryPoints: Object.fromEntries(
    Object.entries(WORKERS).map(([name, entry]) => [name, path.join(root, entry)]),
  ),
  outdir: outDir,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  // Maps for development only: a release ships none (npm sets npm_lifecycle_event).
  sourcemap: process.env.npm_lifecycle_event === "prebuild" ? false : "linked",
  legalComments: "none",
  tsconfig: path.join(root, "tsconfig.json"),
  // The solver's Node-only HiGHS path (a dynamic import of the package) never
  // runs in a worker: workers load the glue from /highs.js.
  external: ["highs"],
  define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production") },
  // Shared modules read process.env for server knobs; a worker has none.
  banner: { js: "var process=globalThis.process||{env:{}};" },
  logLevel: "warning",
});

console.log(`Built ${Object.keys(WORKERS).length} workers into public/workers/.`);

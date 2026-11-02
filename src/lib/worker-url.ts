import { APP_VERSION } from "@/lib/version";

/**
 * The app's Web Workers, bundled by tools/build-workers.mjs into
 * public/workers/ before dev and build. They are started by URL, not through
 * the bundler: Turbopack copies a `new URL("./x.worker.ts", import.meta.url)`
 * target as raw TypeScript, which a browser cannot run. The version keeps a
 * cached worker from outliving a deploy.
 */
export type AppWorker = "solve-books" | "arrange" | "grid-route" | "dataset";

export function workerUrl(name: AppWorker): string {
  return `/workers/${name}.js?v=${encodeURIComponent(APP_VERSION)}`;
}

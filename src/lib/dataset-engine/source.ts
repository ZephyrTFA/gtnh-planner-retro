import type { DatasetManifest } from "@/lib/datasets/types";

/**
 * Where the recipe engine reads dataset files from. The engine itself is plain
 * computation over parsed JSON, so the same code answers queries in Node (files
 * under `public/`) and in the browser's dataset worker (the same files fetched
 * as static assets). Paths are the public paths the manifest names
 * (`/datasets/gtnh/<id>/...`).
 */
export interface DatasetFileSource {
  /** The dataset manifest. An implementation may cache it while it is unchanged. */
  loadManifest(): Promise<DatasetManifest>;
  /** A gzipped JSON dataset file, unzipped and parsed. */
  readGzipJson<T>(publicPath: string): Promise<T>;
}

let activeSource: DatasetFileSource | undefined;

export function setDatasetFileSource(source: DatasetFileSource): void {
  activeSource = source;
}

export function getDatasetFileSource(): DatasetFileSource {
  if (!activeSource) {
    throw new Error("No dataset file source is set.");
  }
  return activeSource;
}

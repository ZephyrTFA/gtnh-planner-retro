import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import type { DatasetManifest } from "@/lib/datasets/types";
import type { DatasetFileSource } from "@/lib/dataset-engine/source";

const gunzipAsync = promisify(gunzip);

/**
 * Dataset files from `public/` on disk. The manifest is read again when its
 * size or mtime changes, so a dataset published in place shows up without a
 * restart.
 */
export function createNodeDatasetSource(publicRoot = path.join(process.cwd(), "public")): DatasetFileSource {
  const manifestPath = path.join(publicRoot, "datasets", "gtnh", "datasets.manifest.json");
  let manifestCache: DatasetManifest | undefined;
  let manifestCacheStamp: string | undefined;

  return {
    async loadManifest() {
      const stat = await fs.stat(manifestPath);
      const stamp = `${stat.mtimeMs}:${stat.size}`;
      if (manifestCache && manifestCacheStamp === stamp) {
        return manifestCache;
      }
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as DatasetManifest;
      manifestCache = manifest;
      manifestCacheStamp = stamp;
      return manifest;
    },
    async readGzipJson<T>(publicPath: string) {
      const data = await fs.readFile(path.join(publicRoot, publicPath.replace(/^\//, "")));
      const unzipped = await gunzipAsync(data);
      return JSON.parse(unzipped.toString("utf8")) as T;
    },
  };
}

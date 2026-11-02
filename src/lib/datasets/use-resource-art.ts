"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { DatasetVersion } from "@/lib/datasets/types";
import type { ResourceAmount } from "@/lib/model/types";
import { getRecipeDatasetResourceArt } from "@/lib/datasets/browser-loader";
import { DEFAULT_DATASET_MANIFEST_URL } from "@/lib/datasets/remote";
import { useFactoryStore } from "@/store/factory-store";
import { collectResourceArtKeys, isForeignDatasetArt, type ResourceArt } from "./resource-art";

/**
 * Current-dataset art by `kind:id`, asked of the dataset worker in batches.
 * Plans are rewritten when they land (useProjectResourceArt); this covers art
 * that lives outside a plan (the power tables, a browser's recent list) and
 * names another dataset's textures.
 */
const known = new Map<string, ResourceArt | null>();
const queued = new Map<string, DatasetVersion>();
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

function cacheKey(versionId: string, key: string) {
  return `${versionId}|${key}`;
}

function ask(version: DatasetVersion, key: string) {
  const id = cacheKey(version.id, key);
  if (known.has(id) || queued.has(id)) return;
  queued.set(id, version);
  flushTimer ??= setTimeout(flush, 0);
}

function flush() {
  flushTimer = undefined;
  const byVersion = new Map<string, { version: DatasetVersion; keys: string[] }>();
  for (const [id, version] of queued) {
    const entry = byVersion.get(version.id) ?? { version, keys: [] };
    entry.keys.push(id.slice(version.id.length + 1));
    byVersion.set(version.id, entry);
  }
  queued.clear();
  for (const { version, keys } of byVersion.values()) {
    void getRecipeDatasetResourceArt(DEFAULT_DATASET_MANIFEST_URL, version, keys).then(
      (art) => {
        for (const key of keys) known.set(cacheKey(version.id, key), art[key] ?? null);
        generation += 1;
        for (const listener of listeners) listener();
      },
      () => {
        // Leave them unknown: the stored art still shows if it can.
      },
    );
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useCurrentDatasetVersion(): DatasetVersion | undefined {
  return useFactoryStore((state) =>
    state.datasetManifest?.versions.find((version) => version.id === state.selectedDatasetVersionId),
  );
}

type ArtHolder = Pick<ResourceAmount, "kind" | "id" | "iconPath" | "iconAtlas" | "dominantColor">;

/**
 * The resource as this dataset draws it, when its stored art names another
 * dataset's textures; otherwise the resource itself.
 */
export function useCurrentResourceArt<T extends ArtHolder>(resource: T | undefined): T | undefined {
  const version = useCurrentDatasetVersion();
  const foreign = Boolean(resource && version && isForeignDatasetArt(resource, version.id));
  const key = resource ? `${resource.kind}:${resource.id}` : "";
  useEffect(() => {
    if (foreign && version) ask(version, key);
  }, [foreign, version, key]);
  useSyncExternalStore(subscribe, () => (foreign ? generation : 0), () => 0);
  if (!foreign || !resource || !version) return resource;
  // Until the lookup answers, no art: the stored path names files this site does not serve.
  const art = known.get(cacheKey(version.id, key)) ?? null;
  const { iconPath: _path, iconAtlas: _atlas, ...rest } = resource;
  void _path;
  void _atlas;
  return {
    ...rest,
    ...(art?.iconPath ? { iconPath: art.iconPath } : {}),
    ...(art?.iconAtlas ? { iconAtlas: art.iconAtlas } : {}),
    dominantColor: art?.dominantColor ?? resource.dominantColor,
  } as T;
}

/**
 * Every plan that lands on the board is drawn with the current dataset's art:
 * the plan's resources are looked up by kind and id once per plan and dataset,
 * and art this site cannot serve is dropped. Mounted once, by the app.
 */
export function useProjectResourceArt() {
  const version = useCurrentDatasetVersion();
  const projectId = useFactoryStore((state) => state.project.id);
  const datasetReady = useFactoryStore((state) => Boolean(state.dataset));
  useEffect(() => {
    if (!version || !datasetReady) return;
    let cancelled = false;
    const keys = collectResourceArtKeys(useFactoryStore.getState().project);
    if (keys.length === 0) return;
    void getRecipeDatasetResourceArt(DEFAULT_DATASET_MANIFEST_URL, version, keys).then(
      (art) => {
        // The plan may have changed meanwhile; the lookup applies to it as it is now.
        if (!cancelled && useFactoryStore.getState().project.id === projectId) {
          useFactoryStore.getState().applyProjectResourceArt(art);
        }
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [version, projectId, datasetReady]);
}

import type { ResourceAmount } from "@/lib/model/types";

/**
 * Plans, the power tables and anything else that keeps a resource's art keep
 * the art they were made with: a path into one dataset version's textures
 * (`/datasets/gtnh/<version>/textures/...`). A plan made on another site or
 * with another dataset names files this site does not have, so art is always
 * taken from the current dataset by the resource's kind and id.
 */
export type ResourceArt = Pick<ResourceAmount, "iconPath" | "iconAtlas" | "dominantColor">;
export type ResourceArtLookup = Record<string, ResourceArt | null>;

const RESOURCE_KINDS = new Set(["item", "fluid", "aspect"]);
const DATASET_TEXTURE = /^\/datasets\/gtnh\/([^/]+)\/textures\//;

/** The dataset version a piece of art comes from, when it is dataset art at all. */
export function artDatasetVersion(art: Pick<ResourceAmount, "iconPath" | "iconAtlas">): string | undefined {
  const path = art.iconAtlas?.imagePath ?? art.iconPath;
  return path ? DATASET_TEXTURE.exec(path)?.[1] : undefined;
}

/** Art that names another dataset version's textures, which this site may not serve. */
export function isForeignDatasetArt(
  art: Pick<ResourceAmount, "iconPath" | "iconAtlas">,
  currentVersionId: string | undefined,
): boolean {
  const version = artDatasetVersion(art);
  return version !== undefined && version !== currentVersionId;
}

/** `kind:id` of a resource-like object in a plan (`resourceId` on drawers), or undefined. */
function resourceKeyOf(node: Record<string, unknown>): string | undefined {
  const kind = node.kind;
  // A drawer has an id of its own; the resource it holds is resourceId.
  const id = typeof node.resourceId === "string" ? node.resourceId : node.id;
  if (typeof kind !== "string" || !RESOURCE_KINDS.has(kind) || typeof id !== "string") {
    return undefined;
  }
  return `${kind}:${id}`;
}

/** Holds art, or is the kind of object that shows a resource (slots, drawers, faces). */
function holdsArt(node: Record<string, unknown>): boolean {
  return "iconPath" in node || "iconAtlas" in node || "dominantColor" in node || "displayName" in node;
}

/** Every resource a value (a plan, a list) draws, as `kind:id`. */
export function collectResourceArtKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const key = resourceKeyOf(record);
    if (key && holdsArt(record)) keys.add(key);
    for (const child of Object.values(record)) {
      if (child && typeof child === "object") walk(child);
    }
  };
  walk(value);
  return [...keys];
}

/**
 * The value with every resource's art taken from `lookup`. A resource the
 * dataset does not have keeps its own art unless that names dataset textures,
 * which would draw as a broken picture; that art is dropped. Unchanged
 * branches are returned as they were, so an up-to-date plan comes back as
 * the same object.
 */
export function applyResourceArt<T>(value: T, lookup: ResourceArtLookup): T {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      let changed = false;
      const next = node.map((item) => {
        const mapped = visit(item);
        if (mapped !== item) changed = true;
        return mapped;
      });
      return changed ? next : node;
    }
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    let next: Record<string, unknown> | undefined;
    for (const [field, child] of Object.entries(record)) {
      if (child && typeof child === "object") {
        const mapped = visit(child);
        if (mapped !== child) {
          next ??= { ...record };
          next[field] = mapped;
        }
      }
    }
    const key = resourceKeyOf(record);
    if (key && holdsArt(record) && key in lookup) {
      const base = next ?? record;
      const replaced = withArt(base, lookup[key]);
      if (replaced !== base) next = replaced;
    }
    return next ?? record;
  };
  return visit(value) as T;
}

function withArt(node: Record<string, unknown>, art: ResourceArt | null): Record<string, unknown> {
  if (art === null) {
    // Not in this dataset: keep the art only if it is not a dataset texture.
    if (artDatasetVersion(node as Pick<ResourceAmount, "iconPath" | "iconAtlas">) === undefined) {
      return node;
    }
    const { iconPath: _path, iconAtlas: _atlas, ...rest } = node;
    void _path;
    void _atlas;
    return rest;
  }
  const same =
    node.iconPath === art.iconPath &&
    JSON.stringify(node.iconAtlas) === JSON.stringify(art.iconAtlas) &&
    (art.dominantColor === undefined || node.dominantColor === art.dominantColor);
  if (same) return node;
  const { iconPath: _path, iconAtlas: _atlas, ...rest } = node;
  void _path;
  void _atlas;
  return {
    ...rest,
    ...(art.iconPath ? { iconPath: art.iconPath } : {}),
    ...(art.iconAtlas ? { iconAtlas: art.iconAtlas } : {}),
    ...(art.dominantColor ? { dominantColor: art.dominantColor } : {}),
  };
}

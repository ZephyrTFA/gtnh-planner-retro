import { ICON_BASE_URL } from "@/lib/site";

const RENDERED_TEXTURE = /^\/datasets\/gtnh\/[^/]+\/textures\/(rendered|sheets)\//;

/** A path on this site (not protocol-relative), or a picture carried inline. */
export function isSafeArtUrl(url: string): boolean {
  return (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) || /^data:image\/(png|jpeg|webp|gif);/.test(url);
}

/**
 * The URL a dataset texture loads from. Plans and the dataset keep the
 * site-relative path (`/datasets/gtnh/<v>/textures/...`), so a plan never
 * carries a host; only drawing it asks where the icons live (ICON_BASE_URL in
 * site.ts). Anything that is not this site's own art (a plan saved before
 * plans were checked could name any address) draws nothing rather than have
 * the browser call another host.
 */
export function textureUrl(path: string): string {
  if (!isSafeArtUrl(path)) return "";
  return ICON_BASE_URL && RENDERED_TEXTURE.test(path) ? `${ICON_BASE_URL}${path}` : path;
}

/**
 * Every texture loads in CORS mode: sprite fitting and the image export read
 * its pixels, which a cross-origin picture without CORS forbids, and a copy
 * cached from a no-CORS load would fail the export's later CORS fetch.
 */
export const TEXTURE_CROSS_ORIGIN = "anonymous";

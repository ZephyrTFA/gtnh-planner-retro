import { ICON_BASE_URL } from "@/lib/site";

const RENDERED_TEXTURE = /^\/datasets\/gtnh\/[^/]+\/textures\/rendered\//;

/**
 * The URL a dataset texture loads from. Plans and the dataset keep the
 * site-relative path (`/datasets/gtnh/<v>/textures/rendered/...`), so a plan
 * never carries a host; only drawing it asks where the icons live
 * (ICON_BASE_URL in site.ts). Everything else (NEI aspect art, power art)
 * stays on this site.
 */
export function textureUrl(path: string): string {
  return ICON_BASE_URL && RENDERED_TEXTURE.test(path) ? `${ICON_BASE_URL}${path}` : path;
}

/**
 * Every texture loads in CORS mode: sprite fitting and the image export read
 * its pixels, which a cross-origin picture without CORS forbids, and a copy
 * cached from a no-CORS load would fail the export's later CORS fetch.
 */
export const TEXTURE_CROSS_ORIGIN = "anonymous";

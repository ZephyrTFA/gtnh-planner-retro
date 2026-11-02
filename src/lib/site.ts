/**
 * Who this deployment is: its name, its address and the links in its menus.
 * Everything that varies per host comes from the environment, so a fork or a
 * self-hosted copy points at itself and never at another site. A link left
 * unset is hidden rather than defaulted to someone else's.
 */

export const SITE_NAME = "GTNH Planner Retro";

/** Canonical address for metadata, sitemaps and share links. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** The host part of SITE_URL, as printed on exported images. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

/** This deployment's source repository (GitHub), for the Source and Report a bug links. */
export const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL?.replace(/\/+$/, "") || undefined;

/** A community chat link (Discord invite or thread). */
export const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || undefined;

/** A tip jar. */
export const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL || undefined;

/** The project this one is built from; MIT, credited in the menu. */
export const UPSTREAM_URL = "https://github.com/jackwrichards/gtnh-factory-flow";

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

/**
 * Where rendered item and fluid icons are served from, when not this site
 * (a bucket on its own hostname: there are more icons than a static host takes
 * files). The host keeps the dataset's paths, so an icon at
 * `/datasets/gtnh/<v>/textures/rendered/x.png` lives at `<base>/datasets/gtnh/<v>/textures/rendered/x.png`,
 * and must answer with CORS headers or image export and sprite fitting cannot
 * read the pixels. Unset: the site serves its own icons.
 */
export const ICON_BASE_URL = process.env.NEXT_PUBLIC_ICON_BASE_URL?.replace(/\/+$/, "") || undefined;

/** A community chat link (Discord invite or thread). */
export const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || undefined;

/** A tip jar. */
export const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL || undefined;

/**
 * Accounts, community posts, comments and votes need a server and a database.
 * The static site has neither, so every door to them stays shut: no sign-in,
 * no Public setups, no posting. Plans still share as links, which need nothing.
 */
export const ONLINE_FEATURES = false;

/**
 * The "Send a request" form posts to this deployment's own Worker
 * (worker/request.ts), which files it as an issue. Off here, or with no
 * Turnstile site key, the Help menu has no such item: a copy hosted without
 * the Worker must not show a button that can only fail.
 */
export const REQUESTS_ENABLED = true;

/** The Turnstile widget's site key (public). Its secret lives only in the Worker. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;

/** Whether this build shows the request form. */
export const REQUEST_FORM_ENABLED = REQUESTS_ENABLED && Boolean(TURNSTILE_SITE_KEY);

/** The project this one is built from; MIT, credited in the menu. */
export const UPSTREAM_URL = "https://github.com/jackwrichards/gtnh-factory-flow";

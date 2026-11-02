import { z } from "zod";

/**
 * Zod compiles fast validators with `new Function` unless told not to. The
 * site's CSP allows no eval, and its probe for it reports a violation, so
 * every entry (the page and each worker) imports this before any schema runs.
 */
z.config({ jitless: true });

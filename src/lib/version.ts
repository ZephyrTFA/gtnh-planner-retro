/**
 * The user-facing app version, shown as a chip in the header.
 *
 * ONE bump per RELEASE (a deploy to the live site), never one per commit,
 * with a single changelog entry covering it: minor for a release carrying
 * features (1.1.0), patch for one that is only fixes (1.0.1).
 *
 * Retro numbers its own releases from 1.0.0; the 3.x entries in the changelog are
 * the GTNH Factory Flow history it is built on.
 *
 * Check the deployed `/version.json` first. If it is BEHIND this
 * number, the release has not shipped yet: fold new work into the top
 * changelog entry and leave the number alone. If it MATCHES, everything is
 * live and the next change starts a new release.
 *
 * Every bump needs an entry in `src/lib/changelog.ts`, written for players:
 * a headline plus a few one-line notes.
 */
export const APP_VERSION = "1.3.2";

/**
 * Manifest order: newest PACK first, not newest publish (the app defaults to
 * the first version; sorting by publishedAt once handed everyone 2.8.4 because
 * it was re-normalized a few minutes after 2.9). Within one pack the plain
 * pack comes before its addon sets, so an addon dataset never becomes the
 * default just because it was built later.
 */
export function orderManifestVersions(versions) {
  return [...versions].sort(
    (a, b) =>
      b.gtnhVersion.localeCompare(a.gtnhVersion, undefined, { numeric: true }) ||
      Number(Boolean(a.addonSet)) - Number(Boolean(b.addonSet)) ||
      b.publishedAt.localeCompare(a.publishedAt),
  );
}

/** The default stable version: the newest plain pack, else the newest stable at all. */
export function latestStableVersionId(orderedVersions) {
  const stable = orderedVersions.filter((version) => version.channel === "stable");
  return (stable.find((version) => !version.addonSet) ?? stable[0])?.id;
}

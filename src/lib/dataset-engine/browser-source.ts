import type { DatasetManifest } from "@/lib/datasets/types";
import type { DatasetFileSource } from "./source";

/**
 * Dataset files as the site's own static assets. A static host may send a
 * `.gz` file as it is or with `Content-Encoding: gzip` (the browser then
 * unzips it on the way in), so the bytes decide: gzip's magic number goes
 * through DecompressionStream, anything else is already JSON.
 */
export function createBrowserDatasetSource(origin: string): DatasetFileSource {
  let manifest: Promise<DatasetManifest> | undefined;

  const loadManifest = () => {
    // One read per worker: a page that outlives a dataset publish keeps the
    // dataset it started with, as the page's own catalog does.
    manifest ??= fetchBytes(new URL("/datasets/gtnh/datasets.manifest.json", origin), "no-cache")
      .then((bytes) => parseJson<DatasetManifest>(bytes))
      .catch((error) => {
        manifest = undefined;
        throw error;
      });
    return manifest;
  };

  return {
    loadManifest,
    async readGzipJson<T>(publicPath: string) {
      // Index and shard names do not change when a version is rebuilt, so the
      // version's checksum rides along: the host can cache them for good
      // (public/_headers) and a rebuild still reaches every browser.
      const url = new URL(publicPath, origin);
      const version = (await loadManifest()).versions.find((entry) =>
        publicPath.startsWith(`/datasets/gtnh/${entry.id}/`),
      );
      const stamp = version?.checksumSha256 ?? version?.publishedAt;
      if (stamp) url.searchParams.set("h", stamp.slice(0, 16));
      const bytes = await fetchBytes(url, "default");
      return parseJson<T>(isGzip(bytes) ? await gunzip(bytes) : bytes);
    },
  };
}

async function fetchBytes(url: URL, cache: RequestCache): Promise<Uint8Array> {
  const response = await fetch(url, { cache });
  if (!response.ok) {
    throw new Error(`Dataset file ${url.pathname} failed (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const decoder = new TextDecoder();

function parseJson<T>(bytes: Uint8Array): T {
  return JSON.parse(decoder.decode(bytes)) as T;
}

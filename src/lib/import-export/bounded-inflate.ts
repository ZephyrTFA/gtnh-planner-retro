/**
 * Limits on plans that arrive from outside. A few kilobytes of compressed
 * text can unpack to gigabytes, and a PNG can claim any size, so everything is
 * checked before (or while) it is unpacked, never after.
 */

/** A plan's JSON: the biggest real plans are a few hundred kilobytes. */
export const MAX_PLAN_JSON_BYTES = 16 * 1024 * 1024;
/** A copied plan's text (`gtnh1.` + base64url). */
export const MAX_PLAN_CODE_CHARS = 2_000_000;
/** A plan file (JSON, SVG or PNG) chosen or dropped. An SVG export of a big board runs to tens of megabytes. */
export const MAX_PLAN_FILE_BYTES = 128 * 1024 * 1024;
/** A PNG's pixels are drawn to read a plan from them: bounded before decoding. */
export const MAX_PLAN_PNG_SIDE = 16_384;
export const MAX_PLAN_PNG_PIXELS = 64 * 1024 * 1024;

export class PlanTooLargeError extends Error {
  constructor(message = "That plan is too big to open.") {
    super(message);
    this.name = "PlanTooLargeError";
  }
}

/** Decompresses `bytes`, reading the output in chunks and stopping as soon as it passes `maxBytes`. */
export async function inflateBounded(
  bytes: Uint8Array,
  format: "deflate-raw" | "gzip",
  maxBytes = MAX_PLAN_JSON_BYTES,
): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PlanTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** A PNG's width and height from its IHDR chunk, without decoding it. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  // 8-byte signature, then IHDR: length (4), "IHDR" (4), width (4), height (4).
  if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function assertPlanPngSize(bytes: Uint8Array): void {
  const size = pngDimensions(bytes);
  if (
    !size ||
    size.width > MAX_PLAN_PNG_SIDE ||
    size.height > MAX_PLAN_PNG_SIDE ||
    size.width * size.height > MAX_PLAN_PNG_PIXELS
  ) {
    throw new PlanTooLargeError("That picture is too big to read a plan from.");
  }
}

import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assertPlanPngSize,
  inflateBounded,
  MAX_PLAN_CODE_CHARS,
  PlanTooLargeError,
  pngDimensions,
} from "./bounded-inflate";
import { decodePlanCode } from "./plan-code";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("bounded inflate", () => {
  it("unpacks what fits", async () => {
    const text = "plan ".repeat(1000);
    const out = await inflateBounded(new Uint8Array(zlib.deflateRawSync(Buffer.from(text))), "deflate-raw");
    expect(new TextDecoder().decode(out)).toBe(text);
  });

  it("stops a small input that unpacks past the limit", async () => {
    // 8 MiB of spaces packs to a few kilobytes.
    const bomb = new Uint8Array(zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, 32)));
    expect(bomb.length).toBeLessThan(64 * 1024);
    await expect(inflateBounded(bomb, "gzip", 1024 * 1024)).rejects.toBeInstanceOf(PlanTooLargeError);
  });

  it("refuses a plan code that unpacks past the limit", async () => {
    const bomb = "gtnh1." + zlib.deflateRawSync(Buffer.alloc(40 * 1024 * 1024, 32), { level: 9 }).toString("base64url");
    await expect(decodePlanCode(bomb)).rejects.toThrow("too big");
  });

  it("refuses a plan code longer than any real one before decoding it", async () => {
    await expect(decodePlanCode("gtnh1." + "A".repeat(MAX_PLAN_CODE_CHARS + 1))).rejects.toThrow("too big");
  });
});

describe("plan pictures", () => {
  it("reads a PNG's size from its header", () => {
    expect(pngDimensions(pngHeader(8192, 4096))).toEqual({ width: 8192, height: 4096 });
  });

  it("allows an export-sized picture and refuses a huge claim before it is decoded", () => {
    expect(() => assertPlanPngSize(pngHeader(8192, 4096))).not.toThrow();
    expect(() => assertPlanPngSize(pngHeader(100_000, 10))).toThrow(PlanTooLargeError);
    expect(() => assertPlanPngSize(pngHeader(16_000, 16_000))).toThrow(PlanTooLargeError);
    expect(() => assertPlanPngSize(new Uint8Array(10))).toThrow(PlanTooLargeError);
  });
});

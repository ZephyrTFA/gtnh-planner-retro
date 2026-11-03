import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve(import.meta.dirname, "security-headers.mjs");
const dirs = [];

/** Runs the script on a tiny export and answers its CSP as a map of directive to sources. */
function cspFor(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-headers-"));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, "index.html"), "<html><script>1</script></html>");
  const childEnv = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
  }
  execFileSync(process.execPath, [script, dir], { env: childEnv, stdio: "pipe" });
  const line = fs
    .readFileSync(path.join(dir, "_headers"), "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("Content-Security-Policy:"));
  const policy = line.trim().slice("Content-Security-Policy:".length).trim();
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("security headers", () => {
  it("names no third party without a Turnstile site key", () => {
    const csp = cspFor({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined, NEXT_PUBLIC_ICON_BASE_URL: undefined });
    expect(csp.has("frame-src")).toBe(false);
    for (const values of csp.values()) {
      expect(values.join(" ")).not.toContain("challenges.cloudflare.com");
    }
    expect(csp.get("default-src")).toEqual(["'none'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("allows Turnstile's script and frame, and nothing more, with a site key", () => {
    const without = cspFor({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined, NEXT_PUBLIC_ICON_BASE_URL: undefined });
    const csp = cspFor({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", NEXT_PUBLIC_ICON_BASE_URL: undefined });
    expect(csp.get("script-src")).toContain("https://challenges.cloudflare.com");
    expect(csp.get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
    // Every other directive is exactly as strict as without the key.
    for (const [name, values] of without) {
      if (name === "script-src") {
        expect(csp.get(name).filter((v) => v !== "https://challenges.cloudflare.com")).toEqual(values);
      } else {
        expect(csp.get(name)).toEqual(values);
      }
    }
    expect([...csp.keys()].filter((name) => !without.has(name))).toEqual(["frame-src"]);
  });
});

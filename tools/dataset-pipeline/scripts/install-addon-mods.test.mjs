import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addonSetsDir, classOwnersFromEntries, installAddonMods, loadAddonSet, parseAddonSet } from "./install-addon-mods.mjs";

const folders = [];
afterEach(() => {
  for (const dir of folders.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-mods-"));
  folders.push(dir);
  return dir;
}

const jar = Buffer.from("PK fake jar");
const jarSha = createHash("sha256").update(jar).digest("hex");

function spec(overrides = {}) {
  return {
    id: "demo",
    label: "Demo",
    gtnhVersion: "2.9.0",
    mods: [{ name: "Demo Mod", version: "1.0", url: "https://example.com/dl/demo-1.0.jar", sha256: jarSha }],
    ...overrides,
  };
}

function fakeFetch(body, calls = []) {
  return async (url) => {
    calls.push(url);
    return new Response(body);
  };
}

describe("addon sets", () => {
  it("every checked-in set parses", async () => {
    const ids = fs.readdirSync(addonSetsDir).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const set = await loadAddonSet(id);
      expect(set.id).toBe(id);
    }
  });

  it("rejects a spec that is not pinned to an https jar and a sha256", () => {
    expect(() => parseAddonSet(spec({ mods: [{ ...spec().mods[0], sha256: "abc" }] }))).toThrow(/sha256/);
    expect(() => parseAddonSet(spec({ mods: [{ ...spec().mods[0], url: "http://example.com/a.jar" }] }))).toThrow(/https/);
    expect(() => parseAddonSet(spec({ mods: [{ ...spec().mods[0], url: "https://example.com/a.zip" }] }))).toThrow(/\.jar/);
    expect(() => parseAddonSet(spec(), "other")).toThrow(/file name/);
  });

  it("keeps recipe hooks that name package.Class.method and rejects anything else", () => {
    expect(parseAddonSet(spec()).recipeHooks).toEqual([]);
    const hook = "com.example.demo.RecipeLoader.loadLate";
    expect(parseAddonSet(spec({ recipeHooks: [hook] })).recipeHooks).toEqual([hook]);
    expect(() => parseAddonSet(spec({ recipeHooks: hook }))).toThrow(/list/);
    expect(() => parseAddonSet(spec({ recipeHooks: ["loadLate"] }))).toThrow(/package\.Class\.method/);
    expect(() => parseAddonSet(spec({ recipeHooks: ["RecipeLoader.load Late"] }))).toThrow(/package\.Class\.method/);
  });

  it("installs pinned jars, then reuses the cache", async () => {
    const dir = tempDir();
    const modsDir = path.join(dir, "mods");
    const cacheDir = path.join(dir, "cache");
    const set = parseAddonSet(spec());
    const calls = [];
    const options = { set, modsDir, cacheDir, gtnhVersion: "2.9.0", fetchImpl: fakeFetch(jar, calls), log: () => {} };

    const record = await installAddonMods(options);
    expect(fs.readFileSync(path.join(modsDir, "demo-1.0.jar"))).toEqual(jar);
    expect(record.mods[0]).toMatchObject({ name: "Demo Mod", sha256: jarSha });

    fs.rmSync(modsDir, { recursive: true });
    await installAddonMods(options);
    expect(calls).toHaveLength(1);
  });

  it("stops on a checksum mismatch, a different pack version, or a jar the pack already has", async () => {
    const dir = tempDir();
    const modsDir = path.join(dir, "mods");
    const cacheDir = path.join(dir, "cache");
    const set = parseAddonSet(spec());
    const base = { set, modsDir, cacheDir, log: () => {} };

    await expect(installAddonMods({ ...base, fetchImpl: fakeFetch(Buffer.from("changed")) })).rejects.toThrow(/checksum mismatch/);
    expect(fs.existsSync(path.join(modsDir, "demo-1.0.jar"))).toBe(false);

    await expect(installAddonMods({ ...base, gtnhVersion: "2.8.4", fetchImpl: fakeFetch(jar) })).rejects.toThrow(/pinned to GTNH 2\.9\.0/);

    fs.writeFileSync(path.join(modsDir, "demo-1.0.jar"), "pack copy");
    await expect(installAddonMods({ ...base, fetchImpl: fakeFetch(jar) })).rejects.toThrow(/already ships/);
  });

  it("fetches a private GitHub release asset with the token and installs it under its fileName", async () => {
    const assetUrl = "https://api.github.com/repos/owner/repo/releases/assets/123";
    expect(() => parseAddonSet(spec({ mods: [{ ...spec().mods[0], url: assetUrl }] }))).toThrow(/\.jar/);
    expect(() => parseAddonSet(spec({ mods: [{ ...spec().mods[0], url: assetUrl, fileName: "a/b.jar" }] }))).toThrow(
      /bare file name/,
    );
    const set = parseAddonSet(spec({ mods: [{ ...spec().mods[0], url: assetUrl, fileName: "demo-1.0.jar" }] }));

    const dir = tempDir();
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push(init.headers);
      return init.headers.Authorization ? new Response(jar) : new Response("", { status: 404, statusText: "Not Found" });
    };
    const base = { set, modsDir: path.join(dir, "mods"), cacheDir: path.join(dir, "cache"), fetchImpl, log: () => {} };

    await expect(installAddonMods(base)).rejects.toThrow(/needs GITHUB_TOKEN/);
    await installAddonMods({ ...base, githubToken: "t0ken" });
    expect(seen[1]).toEqual({ Accept: "application/octet-stream", Authorization: "Bearer t0ken" });
    expect(fs.readFileSync(path.join(dir, "mods", "demo-1.0.jar"))).toEqual(jar);
  });

  it("sends no token to other hosts", async () => {
    const dir = tempDir();
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push(init.headers);
      return new Response(jar);
    };
    const set = parseAddonSet(spec());
    await installAddonMods({ set, modsDir: path.join(dir, "mods"), cacheDir: path.join(dir, "cache"), githubToken: "t0ken", fetchImpl, log: () => {} });
    expect(seen).toEqual([{}]);
  });
});

describe("addon class owners", () => {
  it("maps each class in a jar to its mod, skipping multi-release copies and non-classes", () => {
    expect(
      classOwnersFromEntries({
        "Twist Space Technology": [
          "com/Nxer/TwistSpaceTechnology/common/machine/TST_BallLightning.class",
          "META-INF/versions/17/com/Nxer/TwistSpaceTechnology/Other.class",
          "assets/twistspacetechnology/lang/en_US.lang",
        ],
      }),
    ).toEqual({ "com.Nxer.TwistSpaceTechnology.common.machine.TST_BallLightning": "Twist Space Technology" });
  });
});

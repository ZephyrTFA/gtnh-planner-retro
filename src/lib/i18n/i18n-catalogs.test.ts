import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ru from "./ru_RU";
import zh from "./zh_CN";

/**
 * Every interface string passed to t() / tPlural() is a literal, so the full
 * set of keys can be read out of the source. Both catalogs must cover all of
 * them, and keep nothing the source no longer asks for.
 */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;
const T_CALL = new RegExp(String.raw`\b(?:t|msg)\(\s*${STRING}`, "g");
const PLURAL_CALL = new RegExp(String.raw`\btPlural\(\s*[^,]+,\s*${STRING}\s*,\s*${STRING}`, "g");

function collectKeys() {
  const keys = new Set<string>();
  const nonLiteral: string[] = [];
  for (const file of sourceFiles(path.resolve(__dirname, "../.."))) {
    if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(T_CALL)) keys.add(JSON.parse(`"${match[1]}"`));
    for (const match of source.matchAll(PLURAL_CALL)) {
      keys.add(`${JSON.parse(`"${match[1]}"`)}|${JSON.parse(`"${match[2]}"`)}`);
    }
    for (const match of source.matchAll(/\bt\(\s*[`'][^)]*/g)) nonLiteral.push(`${path.relative(process.cwd(), file)}: ${match[0]}`);
  }
  return { keys, nonLiteral };
}

describe("interface catalogs", () => {
  const { keys, nonLiteral } = collectKeys();

  it("t() and msg() keys are double-quoted literals", () => {
    expect(nonLiteral).toEqual([]);
  });

  for (const [name, catalog] of [["ru_RU", ru], ["zh_CN", zh]] as const) {
    it(`${name} translates every interface string`, () => {
      expect([...keys].filter((key) => !(key in catalog)).sort()).toEqual([]);
    });
    it(`${name} keeps no strings the source no longer uses`, () => {
      expect(Object.keys(catalog).filter((key) => !keys.has(key)).sort()).toEqual([]);
    });
    it(`${name} keeps every {placeholder} of its English key`, () => {
      const broken = Object.entries(catalog).flatMap(([key, value]) => {
        // A plural key joins its English forms ("<one>|<other>"), so its names
        // are compared as a set: each translated form uses every name either does.
        const plural = typeof value !== "string";
        const names = (text: string) => {
          const all = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
          return (plural ? [...new Set(all)] : all).sort().join();
        };
        const want = names(key);
        const forms = typeof value === "string" ? [value] : Object.values(value);
        return forms.filter((form) => names(form ?? "") !== want)
          .map((form) => `${key} -> ${form}`);
      });
      expect(broken).toEqual([]);
    });
  }
});

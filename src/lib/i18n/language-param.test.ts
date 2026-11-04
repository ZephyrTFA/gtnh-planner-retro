import { describe, expect, it } from "vitest";
import { parseLanguage } from "./index";

describe("parseLanguage", () => {
  it("reads a language however the address writes it", () => {
    expect(parseLanguage("zh_cn")).toBe("zh_CN");
    expect(parseLanguage("zh-CN")).toBe("zh_CN");
    expect(parseLanguage("ZH")).toBe("zh_CN");
    expect(parseLanguage("ru_RU")).toBe("ru_RU");
    expect(parseLanguage("ru")).toBe("ru_RU");
    expect(parseLanguage("en")).toBe("en_US");
    expect(parseLanguage(" en-us ")).toBe("en_US");
  });

  it("ignores languages the planner does not have", () => {
    expect(parseLanguage(null)).toBeUndefined();
    expect(parseLanguage("")).toBeUndefined();
    expect(parseLanguage("de")).toBeUndefined();
    expect(parseLanguage("zh_tw")).toBeUndefined();
    expect(parseLanguage("z")).toBeUndefined();
  });
});

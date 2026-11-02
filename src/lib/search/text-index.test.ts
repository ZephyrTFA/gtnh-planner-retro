import { describe, expect, it } from "vitest";
import { buildTextSearchIndex, buildTokenIdSearchIndex, encodeSearchTokens } from "./text-index";

const texts = [
  "Steel Ingot Electric Blast Furnace steel dust oxygen",
  "Polyethylene Sheet Chemical Reactor ethylene oxygen",
  "",
  "Iron Ingot Furnace iron ore iron",
  "Naquadah Alloy Ingot Vacuum Freezer hot naquadah alloy ingot",
  "A b c xy",
];

describe("recipe search index from word numbers", () => {
  it("is the index the text would build", () => {
    const fromText = buildTextSearchIndex(texts, texts.map((_, index) => index));
    const { vocabulary, tokenIds } = encodeSearchTokens(texts);
    const fromIds = buildTokenIdSearchIndex(vocabulary, tokenIds);

    expect(Object.fromEntries(fromIds.trigramToEntries)).toEqual(Object.fromEntries(fromText.trigramToEntries));
    for (let entry = 0; entry < texts.length; entry += 1) {
      expect(fromIds.tokensOf(entry)).toEqual(fromText.tokensOf(entry));
    }
    expect(fromIds.tokensOf(99)).toEqual([]);
  });

  it("stores each word once", () => {
    const { vocabulary, tokenIds } = encodeSearchTokens(["iron ingot iron", "iron plate"]);
    expect(vocabulary).toEqual(["iron", "ingot", "plate"]);
    expect(tokenIds).toEqual([[0, 1], [0, 2]]);
  });
});

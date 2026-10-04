import { describe, expect, it } from "vitest";

import { coerceReviewPalette, normalizeReviewPalette } from "@/lib/review/palette";

describe("review palette validation", () => {
  it("normalizes HEX and retains source percentages without inventing manual weights", () => {
    expect(normalizeReviewPalette([{ hex: "abcdef", percentage: 0.35 }, { hex: " #000000 " }]))
      .toEqual([{ hex: "#ABCDEF", percentage: 0.35 }, { hex: "#000000", percentage: null }]);
  });
  it("deduplicates exact colors in submitted order without approximate substitution", () => {
    expect(normalizeReviewPalette([{ hex: "#abcdef" }, { hex: "#ABCDEF" }, { hex: "#ABCDEE" }]))
      .toEqual([{ hex: "#ABCDEF", percentage: null }, { hex: "#ABCDEE", percentage: null }]);
  });
  it.each([NaN, Infinity, -0.01, 1.01, "0.2"])("rejects invalid percentage %s", (percentage) => {
    expect(() => normalizeReviewPalette([{ hex: "#ABCDEF", percentage }])).toThrow("占比");
  });
  it("accepts five colors and refuses six before publishing", () => {
    const colors = Array.from({ length: 6 }, (_, i) => ({ hex: `#00000${i}` }));
    expect(normalizeReviewPalette(colors.slice(0, 5))).toHaveLength(5);
    expect(() => normalizeReviewPalette(colors)).toThrow("最多 5");
  });
  it.each([null, {}, [null], [{ hex: "#FFF" }], [{ hex: 123 }], [["#000000"]]])("rejects invalid structured input", (value) => {
    expect(() => normalizeReviewPalette(value)).toThrow();
  });
  it("handles optional empty palette and refuses malformed/oversized form data", () => {
    expect(coerceReviewPalette(null)).toEqual([]);
    expect(coerceReviewPalette("[]")).toEqual([]);
    expect(() => coerceReviewPalette("[broken")).toThrow("格式");
    expect(() => coerceReviewPalette(" ".repeat(2049))).toThrow("格式");
  });
});

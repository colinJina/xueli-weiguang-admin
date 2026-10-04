import { describe, expect, it } from "vitest";

import { appendReviewSelections, replaceReviewPaletteColor, supplementReviewPalette, toggleReviewSelection } from "./pvdex-form-state";
import type { ReviewPaletteColor } from "./palette";

const manual = (hex: string): ReviewPaletteColor => ({ hex, percentage: null });
const suggested = (hex: string, percentage = 0.1): ReviewPaletteColor => ({ hex, percentage });

describe("PVDex review selections", () => {
  it("preserves manual category, colors and percentages, deduplicating suggestions", () => {
    expect(appendReviewSelections(
      { categoryId: "manual", tagIds: ["a"], palette: [manual("#FF0000")] },
      { categoryId: "suggested", tagIds: ["a", "b"], palette: [suggested("#ff0000"), suggested("#0000FF")] },
    )).toEqual({ ok: true, value: { categoryId: "manual", tagIds: ["a", "b"], palette: [manual("#FF0000"), suggested("#0000FF")] } });
  });

  it("fills an empty category and supports five colors", () => {
    const palette = ["#111111", "#222222", "#333333", "#444444", "#555555"].map(manual);
    expect(appendReviewSelections(
      { categoryId: "", tagIds: [], palette: [] },
      { categoryId: "pv", tagIds: ["a", "b", "c", "d"], palette },
    )).toEqual({ ok: true, value: { categoryId: "pv", tagIds: ["a", "b", "c", "d"], palette } });
  });

  it.each([
    { categoryId: "pv", tagIds: ["a", "b", "c", "d", "e"], palette: [] },
    { categoryId: "pv", tagIds: [], palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"].map(manual) },
  ])("rejects overflow without partially changing the form", (suggestions) => {
    const current = { categoryId: "", tagIds: [], palette: [] };
    expect(appendReviewSelections(current, suggestions).ok).toBe(false);
    expect(current).toEqual({ categoryId: "", tagIds: [], palette: [] });
  });

  it("allows tag removal at the limit but prevents another addition", () => {
    const current = ["a", "b", "c", "d"];
    expect(toggleReviewSelection(current, "e", 4)).toBe(current);
    expect(toggleReviewSelection(current, "b", 4)).toEqual(["a", "c", "d"]);
  });
});

describe("dominant palette supplementation", () => {
  it("orders by percentage and fills only remaining slots", () => {
    const current = [manual("#AAAAAA"), manual("#BBBBBB")];
    const candidates = [suggested("#111111", 0.1), suggested("#222222", 0.7), suggested("#333333", 0.4), suggested("#444444", 0.2), suggested("#555555", 0.9), suggested("#666666", 0.01)];
    expect(supplementReviewPalette(current, candidates)).toEqual([...current, candidates[4], candidates[1], candidates[2]]);
    expect(current).toHaveLength(2);
    expect(candidates[0].hex).toBe("#111111");
  });

  it("preserves manual overrides when refreshed suggestions use the same HEX", () => {
    const current = [manual("#111111"), suggested("#222222", 0.25)];
    expect(supplementReviewPalette(current, [suggested("#111111", 0.8), suggested("#222222", 0.1), suggested("#333333", 0.05)]))
      .toEqual([...current, suggested("#333333", 0.05)]);
  });

  it("keeps a full palette unchanged", () => {
    const current = ["#111111", "#222222", "#333333", "#444444", "#555555"].map(manual);
    expect(supplementReviewPalette(current, [suggested("#666666", 1)])).toEqual(current);
  });
});

describe("manual palette replacement", () => {
  it("clears a source percentage only when HEX actually changes", () => {
    const current = [suggested("#ABCDEF", 0.8), manual("#000000")];
    expect(replaceReviewPaletteColor(current, 0, "abcdef")).toEqual({ ok: true, value: current });
    expect(replaceReviewPaletteColor(current, 0, "#123456")).toEqual({ ok: true, value: [manual("#123456"), manual("#000000")] });
    expect(current[0].percentage).toBe(0.8);
  });

  it("rejects invalid and duplicate HEX without changing existing colors", () => {
    const current = [suggested("#ABCDEF", 0.8), manual("#000000")];
    expect(replaceReviewPaletteColor(current, 0, "#abc").ok).toBe(false);
    expect(replaceReviewPaletteColor(current, 0, "000000").ok).toBe(false);
    expect(current).toEqual([suggested("#ABCDEF", 0.8), manual("#000000")]);
  });
});

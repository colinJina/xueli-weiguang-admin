import { describe, expect, it } from "vitest";

import { appendReviewSelections, toggleReviewSelection } from "./pvdex-form-state";

describe("PVDex review selections", () => {
  it("preserves manual classification and selections, deduplicating additions", () => {
    expect(appendReviewSelections(
      { categoryId: "manual", tagIds: ["a"], toneIds: ["red"] },
      { categoryId: "suggested", tagIds: ["a", "b"], toneIds: ["red", "blue"] },
    )).toEqual({ ok: true, value: { categoryId: "manual", tagIds: ["a", "b"], toneIds: ["red", "blue"] } });
  });

  it("fills an empty classification and retains all suggestions within the limits", () => {
    expect(appendReviewSelections(
      { categoryId: "", tagIds: [], toneIds: [] },
      { categoryId: "pv", tagIds: ["a", "b", "c", "d"], toneIds: ["red", "blue", "gray"] },
    )).toMatchObject({ ok: true, value: { categoryId: "pv", tagIds: ["a", "b", "c", "d"] } });
  });

  it.each([
    { categoryId: "pv", tagIds: ["a", "b", "c", "d", "e"], toneIds: [] },
    { categoryId: "pv", tagIds: [], toneIds: ["a", "b", "c", "d"] },
  ])("rejects overflow without partially changing the form", (suggestions) => {
    const current = { categoryId: "", tagIds: [], toneIds: [] };
    expect(appendReviewSelections(current, suggestions).ok).toBe(false);
    expect(current).toEqual({ categoryId: "", tagIds: [], toneIds: [] });
  });

  it("allows removal at the limit but prevents adding another selection", () => {
    const current = ["a", "b", "c", "d"];
    expect(toggleReviewSelection(current, "e", 4)).toBe(current);
    expect(toggleReviewSelection(current, "b", 4)).toEqual(["a", "c", "d"]);
  });
});

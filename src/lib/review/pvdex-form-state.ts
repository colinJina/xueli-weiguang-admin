import { normalizePvdexHex } from "@/lib/pvdex/matching";
import { MAX_REVIEW_COLORS, type ReviewPaletteColor } from "@/lib/review/palette";

export const MAX_REVIEW_TAGS = 4;

export type ReviewSelection = {
  categoryId: string;
  tagIds: string[];
  palette: ReviewPaletteColor[];
};

/** Existing colors and percentages take precedence over refreshed suggestions. */
function appendPalette(current: ReviewPaletteColor[], additions: ReviewPaletteColor[]) {
  const palette = [...current];
  const seen = new Set(current.map((color) => color.hex.toUpperCase()));
  for (const color of additions) {
    const hex = normalizePvdexHex(color.hex);
    if (!hex || seen.has(hex)) { continue; }
    seen.add(hex);
    palette.push({ hex, percentage: color.percentage });
  }
  return palette;
}

export function appendReviewSelections(current: ReviewSelection, additions: ReviewSelection):
  | { ok: true; value: ReviewSelection }
  | { ok: false; error: string } {
  const tagIds = [...new Set([...current.tagIds, ...additions.tagIds])];
  const palette = appendPalette(current.palette, additions.palette);
  if (tagIds.length > MAX_REVIEW_TAGS) {
    return { ok: false, error: `采用后超过 ${MAX_REVIEW_TAGS} 个标签，请减少建议勾选或当前标签。` };
  }
  if (palette.length > MAX_REVIEW_COLORS) {
    return { ok: false, error: `采用后超过 ${MAX_REVIEW_COLORS} 个颜色，请减少建议勾选或当前色板。` };
  }
  return { ok: true, value: { categoryId: current.categoryId || additions.categoryId, tagIds, palette } };
}

/** Fill empty slots using only the five dominant suggestions. */
export function supplementReviewPalette(current: ReviewPaletteColor[], suggestions: Array<ReviewPaletteColor & { order?: number }>) {
  const topColors = [...suggestions]
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0) || (a.order ?? 0) - (b.order ?? 0))
    .slice(0, MAX_REVIEW_COLORS);
  return appendPalette(current, topColors).slice(0, MAX_REVIEW_COLORS);
}

export function replaceReviewPaletteColor(current: ReviewPaletteColor[], index: number, value: string):
  | { ok: true; value: ReviewPaletteColor[] }
  | { ok: false; error: string } {
  const hex = normalizePvdexHex(value);
  if (!hex) { return { ok: false, error: "请输入完整的 6 位 HEX 颜色。" }; }
  if (current.some((color, position) => position !== index && color.hex === hex)) {
    return { ok: false, error: "色板中已经有这个颜色。" };
  }
  if (current[index]?.hex === hex) { return { ok: true, value: current }; }
  return { ok: true, value: current.map((color, position) => position === index ? { hex, percentage: null } : color) };
}

export function toggleReviewSelection(ids: string[], id: string, limit: number) {
  if (ids.includes(id)) { return ids.filter((selected) => selected !== id); }
  return ids.length < limit ? [...ids, id] : ids;
}

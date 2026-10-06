import { normalizeToneColor } from "@/lib/review/review-utils";

export const MAX_REVIEW_COLORS = 5;

export type ReviewPaletteColor = {
  hex: string;
  percentage: number | null;
};

export function normalizeReviewPalette(value: unknown): ReviewPaletteColor[] {
  if (!Array.isArray(value) || value.length > MAX_REVIEW_COLORS) {
    throw new Error(`色板必须是最多 ${MAX_REVIEW_COLORS} 个颜色的列表。`);
  }
  const palette: ReviewPaletteColor[] = [];
  const seen = new Set<string>();
  for (const color of value) {
    if (!color || typeof color !== "object" || Array.isArray(color) ||
      typeof color.hex !== "string") {
      throw new Error("色板颜色格式无效。");
    }
    const hex = normalizeToneColor(color.hex);
    const percentage = color.percentage ?? null;
    if (percentage !== null && (typeof percentage !== "number" ||
      !Number.isFinite(percentage) || percentage < 0 || percentage > 1)) {
      throw new Error("颜色占比必须是 0 到 1 之间的数字。");
    }
    if (!seen.has(hex)) {
      palette.push({ hex, percentage });
      seen.add(hex);
    }
  }
  return palette;
}

export function coerceReviewPalette(value: FormDataEntryValue | null): ReviewPaletteColor[] {
  if (value === null || value === "") {
    return [];
  }
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("色板格式无效。");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("色板格式无效。");
  }
  return normalizeReviewPalette(parsed);
}

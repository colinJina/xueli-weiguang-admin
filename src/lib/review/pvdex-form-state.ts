export const MAX_REVIEW_TAGS = 4;
export const MAX_REVIEW_TONES = 3;

export type ReviewSelection = {
  categoryId: string;
  tagIds: string[];
  toneIds: string[];
};

export function appendReviewSelections(current: ReviewSelection, additions: ReviewSelection):
  | { ok: true; value: ReviewSelection }
  | { ok: false; error: string } {
  const tagIds = [...new Set([...current.tagIds, ...additions.tagIds])];
  const toneIds = [...new Set([...current.toneIds, ...additions.toneIds])];
  if (tagIds.length > MAX_REVIEW_TAGS) {
    return { ok: false, error: `采用后超过 ${MAX_REVIEW_TAGS} 个标签，请减少建议勾选或当前标签。` };
  }
  if (toneIds.length > MAX_REVIEW_TONES) {
    return { ok: false, error: `采用后超过 ${MAX_REVIEW_TONES} 个色调，请减少建议勾选或当前色调。` };
  }
  return {
    ok: true,
    value: { categoryId: current.categoryId || additions.categoryId, tagIds, toneIds },
  };
}

export function toggleReviewSelection(ids: string[], id: string, limit: number) {
  if (ids.includes(id)) {return ids.filter((selected) => selected !== id);}
  return ids.length < limit ? [...ids, id] : ids;
}

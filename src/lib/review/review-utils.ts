const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;
const MAX_ACTION_MESSAGE_LENGTH = 180;

export function buildBilibiliEmbedUrl(bvid: string) {
  if (!BVID_PATTERN.test(bvid)) {
    throw new Error("无效的 Bilibili 视频 ID。");
  }

  return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1`;
}

export function coerceSelectedIds(formData: FormData, fieldName: string, limit: number) {
  const ids = formData
    .getAll(fieldName)
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (ids.length > limit) {
    throw new Error(`最多选择 ${limit} 个条目。`);
  }

  return ids;
}

export function normalizeDictionaryName(value: FormDataEntryValue | null) {
  const name = String(value ?? "").trim();

  if (!name) {
    throw new Error("必须填写名称。");
  }

  return name;
}

export function normalizeToneColor(value: FormDataEntryValue | null) {
  const color = String(value ?? "").trim();

  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error("必须填写有效的 HEX 颜色。");
  }

  return (color.startsWith("#") ? color : `#${color}`).toUpperCase();
}

export function coerceOptionalReviewNote(value: FormDataEntryValue | null) {
  const note = String(value ?? "").trim();
  return note || null;
}

export function getSafeActionMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, MAX_ACTION_MESSAGE_LENGTH);
  }

  return "操作失败。";
}

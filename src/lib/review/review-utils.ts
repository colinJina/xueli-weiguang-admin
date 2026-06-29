const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;
const TONE_FAMILY_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
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

export function normalizeToneFamilyKey(value: FormDataEntryValue | null) {
  const key = String(value ?? "").trim().toLowerCase();

  if (!TONE_FAMILY_KEY_PATTERN.test(key)) {
    throw new Error("色族 key 只能使用小写字母、数字和下划线，并且必须以字母开头。");
  }

  return key;
}

export function normalizeToneColor(value: FormDataEntryValue | null) {
  const color = String(value ?? "").trim();

  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error("必须填写有效的 HEX 颜色。");
  }

  return (color.startsWith("#") ? color : `#${color}`).toUpperCase();
}

export function normalizeToneFamilyId(value: FormDataEntryValue | null) {
  const familyId = String(value ?? "").trim();

  if (!familyId) {
    throw new Error("必须选择色族。");
  }

  return familyId;
}

export function normalizeSortOrder(value: FormDataEntryValue | null) {
  const sortOrder = Number(String(value ?? "0").trim() || "0");

  if (!Number.isInteger(sortOrder)) {
    throw new Error("排序必须是整数。");
  }

  return sortOrder;
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

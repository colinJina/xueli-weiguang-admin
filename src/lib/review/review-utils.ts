const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const MAX_ACTION_MESSAGE_LENGTH = 180;

export function buildBilibiliEmbedUrl(bvid: string) {
  if (!BVID_PATTERN.test(bvid)) {
    throw new Error("Invalid Bilibili video id.");
  }

  return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1`;
}

export function coerceSelectedIds(formData: FormData, fieldName: string, limit: number) {
  const ids = formData
    .getAll(fieldName)
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (ids.length > limit) {
    throw new Error(`Select at most ${limit} items.`);
  }

  return ids;
}

export function normalizeDictionaryName(value: FormDataEntryValue | null) {
  const name = String(value ?? "").trim();

  if (!name) {
    throw new Error("Name is required.");
  }

  return name;
}

export function coerceOptionalReviewNote(value: FormDataEntryValue | null) {
  const note = String(value ?? "").trim();
  return note || null;
}

export function getSafeActionMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, MAX_ACTION_MESSAGE_LENGTH);
  }

  return "Action failed.";
}

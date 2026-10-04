import "server-only";

import {
  normalizeDictionaryName,
  normalizeToneColor,
} from "@/lib/review/review-utils";
import type { DictionaryItem } from "@/lib/review/types";
import type { createClient } from "@/lib/supabase/server";

type DictionarySupabaseClient = Awaited<ReturnType<typeof createClient>>;
type DictionaryWriteError = { message: string; code?: string } | null;
export type DictionaryWriteKind = "categories" | "tags" | "tones";
type DictionaryWriteValues = {
  name: string;
  color_hex?: string;
  sort_order?: number;
};

export type CreateReviewDictionaryInput = {
  kind: "tags" | "tones";
  name: string;
  colorHex?: string;
};

export function throwDictionaryWriteError(error: DictionaryWriteError): void {
  if (!error) {
    return;
  }
  throw new Error(error.code === "23505"
    ? "名称或色值已存在，请使用已有条目。"
    : error.code === "23503"
      ? "条目正在被使用，请刷新后重试。"
      : error.message);
}

// The maintenance page retains its original insert/redirect behavior. The
// review action requests the inserted row so it can update its local form.
export async function insertDictionaryRecord(
  supabase: DictionarySupabaseClient,
  kind: DictionaryWriteKind,
  values: DictionaryWriteValues,
  returnItem = false,
): Promise<{ item: DictionaryItem | null; error: DictionaryWriteError }> {
  const query = supabase.from(kind).insert(values);
  if (!returnItem) {
    const { error } = await query;
    return { item: null, error };
  }
  const result = kind === "tones"
    ? await query.select("id,name,color_hex,created_at").maybeSingle()
    : await query.select("id,name,created_at").maybeSingle();
  const { data, error } = result;
  return { item: data as DictionaryItem | null, error };
}

const DICTIONARY_PAGE_SIZE = 500;
const normalizeNameForMatch = (name: string) => name.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());

// Compare names in JavaScript so whitespace and case use the same rules as
// suggestion matching. Paging avoids PostgREST's default row limit.
async function listReviewDictionaryItems(
  supabase: DictionarySupabaseClient,
  kind: "tags" | "tones",
  colorHex: string | null,
): Promise<DictionaryItem[]> {
  if (kind === "tones") {
    const { data, error } = await supabase.from("tones")
      .select("id,name,color_hex,created_at").eq("color_hex", colorHex);
    throwDictionaryWriteError(error);
    return (data ?? []) as DictionaryItem[];
  }
  const items: DictionaryItem[] = [];
  for (let from = 0; ; from += DICTIONARY_PAGE_SIZE) {
    const query = supabase.from("tags").select("id,name,created_at");
    const { data, error } = await query
      .order("id", { ascending: true }).range(from, from + DICTIONARY_PAGE_SIZE - 1);
    if (error?.code === "PGRST103") {
      return items;
    }
    throwDictionaryWriteError(error);
    const page = (data ?? []) as DictionaryItem[];
    items.push(...page);
    if (page.length < DICTIONARY_PAGE_SIZE) {
      return items;
    }
  }
}

function findUniqueExistingItem(
  items: DictionaryItem[],
  kind: "tags" | "tones",
  name: string,
  colorHex: string | null,
): DictionaryItem | null {
  const matches = items.filter((item) => kind === "tags"
    ? normalizeNameForMatch(item.name) === normalizeNameForMatch(name)
    : item.color_hex?.trim().toUpperCase() === colorHex);
  if (matches.length > 1) {
    throw new Error(kind === "tags"
      ? "存在多个同名标签，请在标签维护中处理后重试。"
      : "存在多个相同色值的色调，请手动选择并在色调维护中处理。");
  }
  return matches[0] ?? null;
}

export async function createOrReuseReviewDictionaryItem(
  supabase: DictionarySupabaseClient,
  input: CreateReviewDictionaryInput,
): Promise<{ item: DictionaryItem; reused: boolean }> {
  if (input.kind !== "tags" && input.kind !== "tones") {
    throw new Error("仅支持创建标签或色调。");
  }
  if (typeof input.name !== "string") {
    throw new Error("必须填写名称。");
  }
  const colorHex = input.kind === "tones" ? normalizeToneColor(input.colorHex ?? null) : null;
  const name = normalizeDictionaryName(input.name.trim() || colorHex);
  const items = await listReviewDictionaryItems(supabase, input.kind, colorHex);
  const existing = findUniqueExistingItem(items, input.kind, name, colorHex);
  if (existing) {
    return { item: existing, reused: true };
  }

  const { item, error } = await insertDictionaryRecord(supabase, input.kind, {
    name,
    ...(colorHex ? { color_hex: colorHex } : {}),
  }, true);
  if (error?.code === "23505") {
    const currentItems = await listReviewDictionaryItems(supabase, input.kind, colorHex);
    const concurrentItem = findUniqueExistingItem(currentItems, input.kind, name, colorHex);
    if (concurrentItem) {
      return { item: concurrentItem, reused: true };
    }
  }
  throwDictionaryWriteError(error);
  if (!item) {
    throw new Error("词条创建后未能读取，请刷新词库后重试。");
  }
  return {
    item,
    reused: false,
  };
}

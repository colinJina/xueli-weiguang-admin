import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { matchPvdexCatalog, normalizePvdexColors, normalizePvdexName, pvdexVideoKey, submissionVideoKey, videoKey, videoKeyFromUrl } from "@/lib/pvdex/matching";
import type { PvdexCatalog, PvdexCatalogEntry, PvdexSuggestionResult } from "@/lib/pvdex/types";
import type { DictionaryItem, SubmissionRow } from "@/lib/review/types";

export const PVDEX_CATALOG_URL = "https://pvdex.flux-ion.cn/api/videos";
export const PVDEX_CACHE_TAG = "pvdex-directory-v1";
export const PVDEX_CACHE_SECONDS = 6 * 60 * 60;
export const PVDEX_TIMEOUT_MS = 15_000;
export const PVDEX_MAX_CACHE_BYTES = 2 * 1024 * 1024;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function decoded(value: unknown): unknown {
  if (typeof value !== "string") { return value; }
  try { return JSON.parse(value); } catch { return null; }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueNames(names: unknown[]): string[] {
  const seen = new Set<string>();
  return names.flatMap((value) => {
    const name = stringValue(value);
    if (!name || seen.has(normalizePvdexName(name))) { return []; }
    seen.add(normalizePvdexName(name));
    return [name];
  });
}

function alternateKeys(metrics: Record<string, unknown>, primaryKey: string): string[] {
  const keys = [videoKeyFromUrl(metrics.otherLink)];
  if (Array.isArray(metrics.altLinks)) {
    for (const rawLink of metrics.altLinks) {
      const link = objectValue(rawLink);
      if (!link) { continue; }
      const prefixed = pvdexVideoKey(link.bvid);
      const declared = typeof link.platform === "string" && typeof link.bvid === "string"
        ? videoKey(link.platform, link.bvid) : null;
      const fromUrl = videoKeyFromUrl(link.url);
      const idKey = prefixed ?? declared;
      const platform = stringValue(link.platform);
      if (platform && (platform !== "bilibili" && platform !== "youtube")) { continue; }
      if (platform && (idKey ?? fromUrl) && !(idKey ?? fromUrl)?.startsWith(`${platform}:`)) { continue; }
      // Conflicting ID and URL values cannot safely identify an alternate video.
      if (idKey && fromUrl && idKey !== fromUrl) { continue; }
      const key = idKey ?? fromUrl;
      if (key) { keys.push(key); }
    }
  }
  return [...new Set(keys.filter((key): key is string => Boolean(key) && key !== primaryKey))];
}

export function parsePvdexCatalog(value: unknown, fetchedAt: string): PvdexCatalog {
  if (!Array.isArray(value)) { throw new Error("PVDex 目录格式无效。"); }
  const entries: PvdexCatalogEntry[] = [];
  const seenIds = new Set<string>();
  for (const rawRecord of value) {
    const record = objectValue(rawRecord);
    if (!record) { continue; }
    const id = stringValue(record.id);
    const primaryKey = pvdexVideoKey(record.bvid);
    if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !primaryKey) { continue; }
    // Repeated copies of the same source record are not distinct matches.
    if (seenIds.has(id)) { continue; }
    seenIds.add(id);
    const tagValues = decoded(record.tags);
    const metrics = objectValue(decoded(record.metrics)) ?? {};
    entries.push({
      id,
      title: stringValue(record.title) ?? String(record.bvid),
      primaryKey,
      alternateKeys: alternateKeys(metrics, primaryKey),
      tags: Array.isArray(tagValues) ? uniqueNames(tagValues) : [],
      categoryNames: uniqueNames([metrics.pvCategory, metrics.typeTag]),
      colors: normalizePvdexColors(record.colors),
      analysisStatus: stringValue(metrics.analysisStatus),
    });
  }
  if (!entries.length) { throw new Error("PVDex 目录为空或无法解析。"); }
  const catalog = { fetchedAt, entries };
  assertPvdexCatalogSize(catalog);
  return catalog;
}

export function assertPvdexCatalogSize(catalog: PvdexCatalog): void {
  // Next's FETCH cache entry also JSON-encodes this string inside its envelope.
  // Check that representation, not only raw UTF-8 JSON, and reserve envelope space.
  const serialized = JSON.stringify(catalog);
  const bytes = Buffer.byteLength(JSON.stringify(serialized), "utf8") + 1024;
  if (bytes >= PVDEX_MAX_CACHE_BYTES) { throw new Error("PVDex 目录超出缓存大小限制。"); }
}

export async function fetchPvdexCatalog(): Promise<PvdexCatalog> {
  const response = await fetch(PVDEX_CATALOG_URL, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(PVDEX_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) { throw new Error("PVDex 目录暂时不可用。"); }
  return parsePvdexCatalog(await response.json(), new Date().toISOString());
}

// Errors deliberately escape the cached callback; no unavailable/empty result is cached.
const getCachedPvdexCatalog = unstable_cache(fetchPvdexCatalog, [PVDEX_CACHE_TAG], {
  revalidate: PVDEX_CACHE_SECONDS,
  tags: [PVDEX_CACHE_TAG],
});

export async function refreshPvdexCatalog(): Promise<void> {
  revalidateTag(PVDEX_CACHE_TAG);
}

export async function getPvdexSuggestions(
  submission: Pick<SubmissionRow, "platform" | "storage_provider" | "external_id">,
  dictionaries: { categories: DictionaryItem[]; tags: DictionaryItem[]; tones: DictionaryItem[] },
): Promise<PvdexSuggestionResult> {
  const key = submissionVideoKey(submission);
  if (!key) {
    return { status: "unsupported", message: "这条投稿没有可匹配的外链视频标识，请继续人工审核。" };
  }
  try {
    const catalog = await getCachedPvdexCatalog();
    return matchPvdexCatalog(catalog, key, dictionaries);
  } catch {
    return { status: "unavailable", message: "PVDex 建议暂时不可用，请稍后重试或继续人工审核。" };
  }
}

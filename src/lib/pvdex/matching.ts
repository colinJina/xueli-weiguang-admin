import type { DictionaryItem, SubmissionRow } from "@/lib/review/types";
import type { PvdexCatalog, PvdexColor, PvdexSuggestionResult } from "@/lib/pvdex/types";

const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const YOUTUBE_ID_PATTERN = /^[0-9A-Za-z_-]{11}$/;

export function normalizePvdexName(name: string) {
  return name.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function normalizePvdexHex(value: unknown): string | null {
  if (typeof value !== "string" || !/^#?[0-9a-fA-F]{6}$/.test(value.trim())) {
    return null;
  }
  return `#${value.trim().replace(/^#/, "").toUpperCase()}`;
}

export function videoKey(platform: string, externalId: string): string | null {
  if (platform === "bilibili" && BVID_PATTERN.test(externalId)) {
    return `bilibili:${externalId}`;
  }
  if (platform === "youtube" && YOUTUBE_ID_PATTERN.test(externalId)) {
    return `youtube:${externalId}`;
  }
  return null;
}

export function pvdexVideoKey(value: unknown): string | null {
  if (typeof value !== "string") { return null; }
  const id = value.trim();
  return id.startsWith("YT_")
    ? videoKey("youtube", id.slice(3))
    : videoKey("bilibili", id);
}

/** Parse links locally; never fetch an external URL supplied by a record. */
export function videoKeyFromUrl(value: unknown): string | null {
  if (typeof value !== "string") { return null; }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") { return null; }
    if (url.username || url.password) { return null; }
    const host = url.hostname.toLowerCase();
    if (["bilibili.com", "www.bilibili.com", "m.bilibili.com"].includes(host)) {
      const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/);
      return match ? videoKey("bilibili", match[1]) : null;
    }
    if (host === "youtu.be") {
      return videoKey("youtube", url.pathname.split("/")[1] ?? "");
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      const id = url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)(?:\/|$)/)?.[1];
      return id ? videoKey("youtube", id) : null;
    }
  } catch {
    // An invalid or unsupported link cannot identify a video.
  }
  return null;
}

export function normalizePvdexColors(value: unknown): PvdexColor[] {
  if (!Array.isArray(value)) { return []; }
  const valid = value.flatMap((color, index) => {
    if (!color || typeof color !== "object") { return []; }
    const hex = normalizePvdexHex(color.hex);
    if (!hex || typeof color.percentage !== "number" || !Number.isFinite(color.percentage)
      || color.percentage < 0 || color.percentage > 1) { return []; }
    const order = Number.isSafeInteger(color.order) && color.order >= 0 ? color.order : index;
    return [{ hex, percentage: color.percentage, order }];
  }).sort((left, right) => right.percentage - left.percentage || left.order - right.order);
  const seen = new Set<string>();
  return valid.filter((color) => {
    if (seen.has(color.hex)) { return false; }
    seen.add(color.hex);
    return true;
  });
}

function matchDictionary(items: DictionaryItem[], name: string) {
  const matches = items.filter((item) => normalizePvdexName(item.name) === normalizePvdexName(name));
  return { item: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

function sourceLink(id: string) {
  return `https://pvdex.flux-ion.cn/video/${encodeURIComponent(id)}`;
}

export function matchPvdexCatalog(
  catalog: PvdexCatalog,
  key: string,
  dictionaries: { categories: DictionaryItem[]; tags: DictionaryItem[]; tones: DictionaryItem[] },
): PvdexSuggestionResult {
  const matches = catalog.entries.filter((entry) => entry.primaryKey === key || entry.alternateKeys.includes(key));
  if (!matches.length) {
    return { status: "not_found", message: "PVDex 暂未收录这条视频，可以继续人工审核。", fetchedAt: catalog.fetchedAt };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      message: "PVDex 有多条记录匹配这条视频，请继续人工审核。",
      fetchedAt: catalog.fetchedAt,
      matches: matches.map(({ id, title }) => ({ id, title, url: sourceLink(id) })),
    };
  }

  const entry = matches[0];
  const categoryNames = new Set([...entry.tags, ...entry.categoryNames].map(normalizePvdexName));
  const categories = dictionaries.categories.filter((item) => categoryNames.has(normalizePvdexName(item.name)));
  const recognizedCategories = new Set(categories.map((item) => normalizePvdexName(item.name)));

  return {
    status: "matched",
    fetchedAt: catalog.fetchedAt,
    match: {
      id: entry.id, title: entry.title, url: sourceLink(entry.id),
      method: entry.primaryKey === key ? "primary" : "alternate",
    },
    categoryId: categories.length === 1 ? categories[0].id : null,
    categories,
    tags: entry.tags.filter((name) => !recognizedCategories.has(normalizePvdexName(name)))
      .map((name) => ({ name, ...matchDictionary(dictionaries.tags, name) })),
    colors: entry.colors.map((color) => {
      const matches = dictionaries.tones.filter((item) => normalizePvdexHex(item.color_hex) === color.hex);
      return { ...color, item: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
    }),
    analysisStatus: entry.analysisStatus,
  };
}

export function submissionVideoKey(submission: Pick<SubmissionRow, "platform" | "storage_provider" | "external_id">) {
  if (submission.storage_provider === "cos" || submission.platform === "cos") { return null; }
  return videoKey(submission.platform, submission.external_id);
}

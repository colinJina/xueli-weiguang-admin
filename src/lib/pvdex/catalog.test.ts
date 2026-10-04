import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheMock = vi.hoisted(() => ({
  cached: undefined as unknown,
  options: undefined as { revalidate: number; tags: string[] } | undefined,
  key: undefined as string[] | undefined,
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => Promise<unknown>, key: string[], options: { revalidate: number; tags: string[] }) => {
    cacheMock.options = options;
    cacheMock.key = key;
    return async () => {
      if (cacheMock.cached !== undefined) { return cacheMock.cached; }
      const value = await callback();
      cacheMock.cached = value;
      return value;
    };
  },
  revalidateTag: (tag: string) => { cacheMock.revalidateTag(tag); cacheMock.cached = undefined; },
}));

import { assertPvdexCatalogSize, getPvdexSuggestions, parsePvdexCatalog, PVDEX_CACHE_SECONDS, PVDEX_CACHE_TAG, PVDEX_CATALOG_URL, PVDEX_MAX_CACHE_BYTES, PVDEX_TIMEOUT_MS, refreshPvdexCatalog } from "@/lib/pvdex/catalog";

const fetchedAt = "2026-10-03T00:00:00.000Z";
const sourceRecord = {
  id: "source-1", bvid: "BV1xx411c7mD", title: "A PV", tags: '["歌曲PV","3DCG"]',
  metrics: JSON.stringify({ otherLink: "https://youtu.be/Cdbxt7L8zEM", analysisStatus: "done" }),
  colors: [{ hex: "#abcdef", percentage: 0.5, order: 0 }],
};
const submission = { platform: "bilibili", storage_provider: "bilibili", external_id: "BV1xx411c7mD" };
const emptyDictionaries = { categories: [], tags: [] };

describe("PVDex directory parsing", () => {
  it("parses JSON strings and retains only review and matching data", () => {
    const catalog = parsePvdexCatalog([{ ...sourceRecord, cover: "https://example.com/cover.jpg", ownerId: "private", desc: "unused" }], fetchedAt);
    expect(catalog.entries[0]).toEqual({
      id: "source-1", title: "A PV", primaryKey: "bilibili:BV1xx411c7mD",
      alternateKeys: ["youtube:Cdbxt7L8zEM"], tags: ["歌曲PV", "3DCG"], categoryNames: [],
      colors: [{ hex: "#ABCDEF", percentage: 0.5, order: 0 }], analysisStatus: "done",
    });
    expect(JSON.stringify(catalog)).not.toContain("ownerId");
    expect(JSON.stringify(catalog)).not.toContain("cover.jpg");
  });

  it("accepts decoded arrays/objects and validates metadata alternate IDs", () => {
    const catalog = parsePvdexCatalog([{ ...sourceRecord, tags: [" 3DCG ", "3dcg", "", 123, null], metrics: {
      pvCategory: " 歌曲PV ", typeTag: "歌曲pv", altLinks: [
        { bvid: "YT_Cdbxt7L8zEM", platform: "youtube", url: "https://www.youtube.com/watch?v=Cdbxt7L8zEM" },
        { bvid: "BV1ab411c7mD", platform: "bilibili" },
        { bvid: "Cdbxt7L8zEM", platform: "youtube" },
        { bvid: "YT_Cdbxt7L8zEM", platform: "bilibili" },
        { bvid: "YT_Cdbxt7L8zEM", url: "https://youtu.be/YU9uGldSfSo" },
        { url: "https://www.youtube.com/watch?v=YU9uGldSfSo" }, null,
      ],
    } }], fetchedAt);
    expect(catalog.entries[0].tags).toEqual(["3DCG"]);
    expect(catalog.entries[0].categoryNames).toEqual(["歌曲PV"]);
    expect(catalog.entries[0].alternateKeys).toEqual(["youtube:Cdbxt7L8zEM", "bilibili:BV1ab411c7mD", "youtube:YU9uGldSfSo"]);
  });

  it("handles absent or malformed optional fields without trusting their contents", () => {
    const catalog = parsePvdexCatalog([{ id: "minimal", bvid: "YT_Cdbxt7L8zEM", tags: "{bad", metrics: "[1]", colors: "invalid" }], fetchedAt);
    expect(catalog.entries[0]).toEqual({
      id: "minimal", title: "YT_Cdbxt7L8zEM", primaryKey: "youtube:Cdbxt7L8zEM", alternateKeys: [],
      tags: [], categoryNames: [], colors: [], analysisStatus: null,
    });
  });

  it("skips invalid records and duplicate copies of the same source record", () => {
    const catalog = parsePvdexCatalog([null, {}, { ...sourceRecord, id: "../unsafe" },
      { ...sourceRecord, bvid: "invalid" }, sourceRecord, sourceRecord], fetchedAt);
    expect(catalog.entries).toHaveLength(1);
  });

  it("rejects changed root formats and empty or wholly invalid catalogs", () => {
    expect(() => parsePvdexCatalog({ videos: [sourceRecord] }, fetchedAt)).toThrow("格式无效");
    expect(() => parsePvdexCatalog([], fetchedAt)).toThrow("为空");
    expect(() => parsePvdexCatalog([{ id: "bad", bvid: "invalid" }], fetchedAt)).toThrow("为空");
  });

  it("guards the UTF-8 cache envelope, including multibyte and escaped content", () => {
    const catalog = parsePvdexCatalog([sourceRecord], fetchedAt);
    expect(() => assertPvdexCatalogSize(catalog)).not.toThrow();
    catalog.entries[0].title = "中".repeat(PVDEX_MAX_CACHE_BYTES / 3);
    expect(() => assertPvdexCatalogSize(catalog)).toThrow("缓存大小");
    catalog.entries[0].title = '"'.repeat(PVDEX_MAX_CACHE_BYTES / 4);
    expect(() => assertPvdexCatalogSize(catalog)).toThrow("缓存大小");
  });
});

describe("PVDex external cache boundary", () => {
  beforeEach(() => { cacheMock.cached = undefined; cacheMock.revalidateTag.mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("uses a fixed no-store request with a 15-second timeout and a six-hour directory cache", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [sourceRecord] });
    vi.stubGlobal("fetch", fetchMock);
    expect((await getPvdexSuggestions(submission, emptyDictionaries)).status).toBe("matched");
    expect((await getPvdexSuggestions(submission, emptyDictionaries)).status).toBe("matched");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(PVDEX_CATALOG_URL, {
      cache: "no-store", redirect: "error", signal, headers: { Accept: "application/json" },
    });
    expect(timeout).toHaveBeenCalledWith(PVDEX_TIMEOUT_MS);
    expect(cacheMock.options).toEqual({ revalidate: PVDEX_CACHE_SECONDS, tags: [PVDEX_CACHE_TAG] });
    expect(cacheMock.key).toEqual([PVDEX_CACHE_TAG]);
  });

  it("does not fetch for COS or unsupported/invalid video IDs", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await getPvdexSuggestions({ ...submission, storage_provider: "cos" }, emptyDictionaries)).status).toBe("unsupported");
    expect((await getPvdexSuggestions({ ...submission, external_id: "bad" }, emptyDictionaries)).status).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP failure", () => Promise.resolve({ ok: false })],
    ["network failure", () => Promise.reject(new Error("secret host details"))],
    ["empty directory", () => Promise.resolve({ ok: true, json: async () => [] })],
    ["invalid JSON", () => Promise.resolve({ ok: true, json: async () => { throw new Error("bad JSON"); } })],
    ["oversized directory", () => Promise.resolve({ ok: true, json: async () => [{ ...sourceRecord, title: "中".repeat(PVDEX_MAX_CACHE_BYTES / 3) }] })],
  ])("does not cache %s and allows the next request to recover", async (_label, failedFetch) => {
    const fetchMock = vi.fn().mockImplementationOnce(failedFetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [sourceRecord] });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPvdexSuggestions(submission, emptyDictionaries);
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret host details");
    expect(cacheMock.cached).toBeUndefined();
    expect((await getPvdexSuggestions(submission, emptyDictionaries)).status).toBe("matched");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles timeout as an unavailable suggestion without caching the error", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Timeout", "TimeoutError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = getPvdexSuggestions(submission, emptyDictionaries);
    await vi.advanceTimersByTimeAsync(PVDEX_TIMEOUT_MS);
    expect((await pending).status).toBe("unavailable");
    expect(cacheMock.cached).toBeUndefined();
  });

  it("refresh invalidates the directory tag and fetches again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [sourceRecord] });
    vi.stubGlobal("fetch", fetchMock);
    await getPvdexSuggestions(submission, emptyDictionaries);
    await refreshPvdexCatalog();
    expect(cacheMock.revalidateTag).toHaveBeenCalledWith(PVDEX_CACHE_TAG);
    await getPvdexSuggestions(submission, emptyDictionaries);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

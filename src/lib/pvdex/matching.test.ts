import { describe, expect, it } from "vitest";

import { matchPvdexCatalog, normalizePvdexColors, normalizePvdexHex, normalizePvdexName, pvdexVideoKey, submissionVideoKey, videoKeyFromUrl } from "@/lib/pvdex/matching";
import type { PvdexCatalog } from "@/lib/pvdex/types";
import type { DictionaryItem } from "@/lib/review/types";

const dictionary = (id: string, name: string, color_hex?: string): DictionaryItem => ({
  id, name, color_hex, created_at: "2026-10-03T00:00:00.000Z",
});
const emptyDictionaries = { categories: [], tags: [] };
const catalog: PvdexCatalog = {
  fetchedAt: "2026-10-03T00:00:00.000Z",
  entries: [{
    id: "source-1", title: "A PV", primaryKey: "bilibili:BV1xx411c7mD",
    alternateKeys: ["youtube:Cdbxt7L8zEM"], tags: ["歌曲PV", "3DCG", "黑白"],
    categoryNames: [], colors: [{ hex: "#ABCDEF", percentage: 0.5, order: 0 }], analysisStatus: "done",
  }],
};

describe("PVDex identifier and normalization", () => {
  it("validates platform identifiers while preserving case-sensitive IDs", () => {
    expect(pvdexVideoKey("BV1xx411c7mD")).toBe("bilibili:BV1xx411c7mD");
    expect(pvdexVideoKey(" YT_Cdbxt7L8zEM ")).toBe("youtube:Cdbxt7L8zEM");
    expect(pvdexVideoKey("bv1xx411c7mD")).toBeNull();
    expect(pvdexVideoKey("YT_short")).toBeNull();
    expect(pvdexVideoKey(null)).toBeNull();
  });

  it("only extracts validated IDs from official platform hosts", () => {
    expect(videoKeyFromUrl("https://www.bilibili.com/video/BV1xx411c7mD/?p=1")).toBe("bilibili:BV1xx411c7mD");
    expect(videoKeyFromUrl("https://www.youtube.com/watch?v=Cdbxt7L8zEM")).toBe("youtube:Cdbxt7L8zEM");
    expect(videoKeyFromUrl("https://youtu.be/Cdbxt7L8zEM?t=3")).toBe("youtube:Cdbxt7L8zEM");
    expect(videoKeyFromUrl("https://m.youtube.com/shorts/Cdbxt7L8zEM")).toBe("youtube:Cdbxt7L8zEM");
    expect(videoKeyFromUrl("https://www.youtube.com.evil.example/watch?v=Cdbxt7L8zEM")).toBeNull();
    expect(videoKeyFromUrl("https://user:pass@www.youtube.com/watch?v=Cdbxt7L8zEM")).toBeNull();
    expect(videoKeyFromUrl("https://youtu.be/invalid")).toBeNull();
    expect(videoKeyFromUrl("not a url")).toBeNull();
  });

  it("normalizes HEX and names without conflating unrelated names", () => {
    expect(normalizePvdexHex(" abcDef ")).toBe("#ABCDEF");
    expect(normalizePvdexHex("#fff")).toBeNull();
    expect(normalizePvdexHex("#ZZZZZZ")).toBeNull();
    expect(normalizePvdexName(" 3DCG ")).toBe("3dcg");
    expect(normalizePvdexName("手绘 动画")).not.toBe(normalizePvdexName("手绘动画"));
  });

  it("rejects original uploads and invalid submission IDs", () => {
    expect(submissionVideoKey({ platform: "bilibili", storage_provider: "cos", external_id: "BV1xx411c7mD" })).toBeNull();
    expect(submissionVideoKey({ platform: "cos", storage_provider: null, external_id: "Cdbxt7L8zEM" })).toBeNull();
    expect(submissionVideoKey({ platform: "youtube", storage_provider: "youtube", external_id: "invalid" })).toBeNull();
  });

  it("rejects invalid color percentages, sorts by weight and deduplicates HEX", () => {
    expect(normalizePvdexColors([
      { hex: "#abcdef", percentage: 0.1, order: 0 },
      { hex: "ABCDEF", percentage: 0.8, order: 2 },
      { hex: "#123456", percentage: 0.2, order: 1 },
      { hex: "#FFFFFF", percentage: 1.01, order: 0 },
      { hex: "#000000", percentage: -1, order: 0 },
      { hex: "#000000", percentage: Number.NaN, order: 0 },
      { hex: "#000000", percentage: "0.5", order: 0 },
      { hex: "invalid", percentage: 0.9, order: 0 }, null,
    ])).toEqual([
      { hex: "#ABCDEF", percentage: 0.8, order: 2 },
      { hex: "#123456", percentage: 0.2, order: 1 },
    ]);
  });
});

describe("PVDex suggestions", () => {
  it("matches primary and alternate exact identifiers", () => {
    const primary = matchPvdexCatalog(catalog, "bilibili:BV1xx411c7mD", emptyDictionaries);
    const alternate = matchPvdexCatalog(catalog, "youtube:Cdbxt7L8zEM", emptyDictionaries);
    expect(primary.status).toBe("matched");
    expect(alternate.status).toBe("matched");
    if (primary.status === "matched" && alternate.status === "matched") {
      expect(primary.match.method).toBe("primary");
      expect(alternate.match.method).toBe("alternate");
      expect(primary.match.url).toBe("https://pvdex.flux-ion.cn/video/source-1");
    }
    expect(matchPvdexCatalog(catalog, "youtube:cdbxt7L8zEM", emptyDictionaries).status).toBe("not_found");
  });

  it("returns ambiguous when different records identify the same platform video", () => {
    const result = matchPvdexCatalog({ ...catalog, entries: [
      ...catalog.entries,
      { ...catalog.entries[0], id: "source-2", primaryKey: "youtube:Cdbxt7L8zEM", alternateKeys: [] },
    ] }, "youtube:Cdbxt7L8zEM", emptyDictionaries);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") { expect(result.matches).toHaveLength(2); }
  });

  it("maps unique local names and removes recognized categories from tag candidates", () => {
    const result = matchPvdexCatalog(catalog, "bilibili:BV1xx411c7mD", {
      categories: [dictionary("cat-1", " 歌曲pv ")],
      tags: [dictionary("tag-1", "3dcg")],
    });
    expect(result.status).toBe("matched");
    if (result.status !== "matched") { return; }
    expect(result.categoryId).toBe("cat-1");
    expect(result.tags).toEqual([
      { name: "3DCG", item: dictionary("tag-1", "3dcg"), ambiguous: false },
      { name: "黑白", item: null, ambiguous: false },
    ]);
    expect(result.colors).toEqual(catalog.entries[0].colors);
    expect(result.analysisStatus).toBe("done");
  });

  it("never arbitrarily selects duplicate local categories or tag names", () => {
    const result = matchPvdexCatalog(catalog, "bilibili:BV1xx411c7mD", {
      categories: [dictionary("cat-1", "歌曲PV"), dictionary("cat-2", "歌曲pv")],
      tags: [dictionary("tag-1", "3DCG"), dictionary("tag-2", "3dcg")],
    });
    if (result.status !== "matched") { throw new Error("Expected a match"); }
    expect(result.categoryId).toBeNull();
    expect(result.categories).toHaveLength(2);
    expect(result.tags[0]).toEqual({ name: "3DCG", item: null, ambiguous: true });
    expect(result.colors).toEqual(catalog.entries[0].colors);
  });

  it("requires choosing when multiple existing categories are candidates", () => {
    const result = matchPvdexCatalog({ ...catalog, entries: [{ ...catalog.entries[0], categoryNames: ["音乐短片"] }] },
      "bilibili:BV1xx411c7mD", { ...emptyDictionaries, categories: [dictionary("cat-1", "歌曲PV"), dictionary("cat-2", "音乐短片")] });
    if (result.status !== "matched") { throw new Error("Expected a match"); }
    expect(result.categoryId).toBeNull();
    expect(result.categories).toHaveLength(2);
  });
});

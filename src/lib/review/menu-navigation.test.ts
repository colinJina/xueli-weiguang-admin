import { describe, expect, it } from "vitest";
import { getMenuReturnPath, escapeLikePattern, matchesSearch, coerceHomeHeroStatus, normalizeSearch } from "./menu-navigation";
import { normalizeDictionaryName, normalizeSortOrder } from "./review-utils";

describe("menu navigation and validation", () => {
  it("retains only supported video filters and the valid page", () => {
    const path = getMenuReturnPath("/dashboard/videos", "/dashboard/videos?q=雪&source=youtube&page=2&notice=forged&next=https://evil.test");
    expect(path).toBe("/dashboard/videos?q=%E9%9B%AA&source=youtube&page=2");
  });
  it.each(["https://evil.test/dashboard/videos?page=2", "//evil.test", "/dashboard/videos-other?page=2", "/dashboard/tags?q=x"])("rejects foreign or mismatched return URLs: %s", (value) => {
    expect(getMenuReturnPath("/dashboard/videos", value)).toBe("/dashboard/videos");
  });
  it("defaults malformed source and page values", () => {
    expect(getMenuReturnPath("/dashboard/videos", "/dashboard/videos?source=invalid&page=Infinity")).toBe("/dashboard/videos");
  });
  it("retains home hero and dictionary filters without trusting messages", () => {
    expect(getMenuReturnPath("/dashboard/home-hero", "/dashboard/home-hero?status=rejected&page=3&error=forged")).toBe("/dashboard/home-hero?status=rejected&page=3");
    expect(getMenuReturnPath("/dashboard/tone-families", "/dashboard/tone-families?q=blue&active=disabled")).toBe("/dashboard/tone-families?q=blue&active=disabled");
    expect(getMenuReturnPath("/dashboard/tones", "/dashboard/tones?family=unassigned&q=gray")).toBe("/dashboard/tones?q=gray&family=unassigned");
    expect(getMenuReturnPath("/dashboard/tags", "/dashboard/tags?family=unassigned&q=a")).toBe("/dashboard/tags?q=a");
  });
  it("uses literal wildcard characters in video title searches", () => {
    expect(escapeLikePattern("50%_\\雪")).toBe("50\\%\\_\\\\雪");
  });
  it("searches multiple dictionary fields without case sensitivity", () => {
    expect(matchesSearch(" BLUE ", "雾蓝", "blue")).toBe(true);
    expect(matchesSearch("不存在", "雾蓝", null)).toBe(false);
    expect(normalizeSearch(["a", "b"])).toBe("");
    expect(coerceHomeHeroStatus("unknown")).toBe("pending");
  });
  it("enforces database name lengths and integer bounds before writing", () => {
    expect(() => normalizeDictionaryName("字".repeat(41))).toThrow("最多 40");
    expect(() => normalizeDictionaryName("字".repeat(21), 20)).toThrow("最多 20");
    expect(normalizeDictionaryName("😀".repeat(40))).toHaveLength(80);
    expect(() => normalizeSortOrder("2147483648")).toThrow("32 位整数");
    expect(() => normalizeSortOrder("1.5")).toThrow("32 位整数");
  });
});

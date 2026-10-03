import { describe, expect, it } from "vitest";
import { buildSubmissionListItem, formatSubmissionDuration } from "./submission-list";
import type { SubmissionListRow } from "./types";

const submission: SubmissionListRow = {
  id: "submission", platform: "bilibili", storage_provider: "bilibili", source_url: "https://www.bilibili.com/video/BVtest",
  external_id: "BVtest", source_ref: null, cover_ref: null, pending_title: null, status: "pending",
  fetched_at: "2026-10-03T00:00:00Z", fetch_error: null, created_at: "2026-10-03T00:00:00Z",
  fetched_title: "视频标题", fetched_cover: "http://i0.hdslb.com/bfs/archive/cover.jpg", fetched_author: "作者", fetched_duration: 125,
};

describe("submission queue content", () => {
  it("shows cached content with a normalized cover and Shanghai submission time", () => {
    const item = buildSubmissionListItem(submission, "bilibili");
    expect(item).toMatchObject({ title: "视频标题", coverUrl: "https://i0.hdslb.com/bfs/archive/cover.jpg", author: "作者", duration: "2:05" });
    expect(item.createdAt).toContain("08:00");
    expect(item.reviewHint.needsAttention).toBe(false);
  });

  it("keeps uncached content honest instead of using the URL or object key as the title", () => {
    const item = buildSubmissionListItem({ ...submission, fetched_title: null, fetched_cover: null, fetched_at: null }, "bilibili");
    expect(item.title).toBe("待获取投稿标题");
    expect(item.coverUrl).toBeNull();
    expect(item.reviewHint.label).toBe("信息待获取");
  });

  it("flags a failed refresh even when older content is still available", () => {
    const item = buildSubmissionListItem({ ...submission, fetch_error: "failed" }, "bilibili");
    expect(item.title).toBe("视频标题");
    expect(item.reviewHint.label).toBe("信息获取失败");
    expect(item.reviewHint.needsAttention).toBe(true);
  });

  it("does not load unsupported external covers or hide missing covers", () => {
    const item = buildSubmissionListItem({ ...submission, fetched_cover: "https://untrusted.example/cover.jpg" }, "bilibili");
    expect(item.coverUrl).toBeNull();
    expect(item.reviewHint.label).toBe("封面待核实");
  });

  it("uses the original title and signed cover without borrowing external metadata", () => {
    const item = buildSubmissionListItem({ ...submission, platform: "cos", storage_provider: "cos", pending_title: "原创作品", fetched_at: null, fetched_duration: null }, "cos", "https://bucket.example/cover.jpg?signature=test");
    expect(item).toMatchObject({ title: "原创作品", coverUrl: "https://bucket.example/cover.jpg?signature=test", author: null, platformLabel: "原创上传" });
    expect(item.reviewHint.needsAttention).toBe(false);
  });

  it.each([[null, null], [0, null], [-1, null], [NaN, null], [Infinity, null], [59.9, "0:59"], [3605, "1:00:05"]])("formats duration %s safely", (value, expected) => {
    expect(formatSubmissionDuration(value)).toBe(expected);
  });
});

import { describe, expect, it, vi } from "vitest";
import { listPublishedVideosPage, listHomeHeroFeatureRequests } from "./queries";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
function resultQuery(result: { data: unknown; count: number | null; error: { code: string; message: string } | null }) {
  const chain = {
    select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), order: vi.fn(), range: vi.fn(),
    then: (resolve: (result: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  for (const method of [chain.select, chain.eq, chain.ilike, chain.order, chain.range]) {
    method.mockReturnValue(chain);
  }
  return chain;
}

describe("menu queries", () => {
  it("filters videos before pagination with escaped title and stable ordering", async () => {
    const query = resultQuery({ data: [{ id: "video" }], count: 1, error: null });
    const client = { from: vi.fn(() => query) };
    const result = await listPublishedVideosPage(client as unknown as Client, { query: "50%", source: "youtube", page: 2 });
    expect(query.ilike).toHaveBeenCalledWith("title", "%50\\%%");
    expect(query.eq).toHaveBeenCalledWith("platform", "youtube");
    expect(query.range).toHaveBeenCalledWith(20, 39);
    expect(query.order).toHaveBeenLastCalledWith("id", { ascending: false });
    expect(result.total).toBe(1);
  });
  it("recovers the filtered count on an out-of-range video page", async () => {
    const page = resultQuery({ data: null, count: null, error: { code: "PGRST103", message: "out of range" } });
    const count = resultQuery({ data: null, count: 22, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(page).mockReturnValueOnce(count) };
    expect(await listPublishedVideosPage(client as unknown as Client, { source: "cos", query: "雪", page: 99 })).toEqual({ rows: [], total: 22 });
    expect(count.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(count.eq).toHaveBeenCalledWith("platform", "cos");
    expect(count.ilike).toHaveBeenCalledWith("title", "%雪%");
  });
  it("throws count errors instead of hiding them as an empty list", async () => {
    const client = { from: vi.fn()
      .mockReturnValueOnce(resultQuery({ data: null, count: null, error: { code: "PGRST103", message: "range" } }))
      .mockReturnValueOnce(resultQuery({ data: null, count: null, error: { code: "42501", message: "denied" } })) };
    await expect(listPublishedVideosPage(client as unknown as Client, { page: 99 })).rejects.toThrow("denied");
  });
  it("loads a home hero request with its submission and unique video in one read", async () => {
    const query = resultQuery({ data: [{ submission_id: "submission", status: "pending", created_at: "date", submission: {
      id: "submission", status: "approved", pending_title: "draft", source_url: "url", source_ref: null, external_id: "id", created_at: "date",
      video: { id: "video", title: "published", cover_url: "cover", published_at: "date" },
    } }], count: 1, error: null });
    const client = { from: vi.fn(() => query) };
    const result = await listHomeHeroFeatureRequests(client as unknown as Client);
    expect(client.from).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("status", "pending");
    expect(query.select.mock.calls[0][0]).toContain("submission:submissions!inner");
    expect(result.rows[0]).toMatchObject({ video_id: "video", title: "published", submission_status: "approved" });
  });
  it("keeps requests without a video, so pending submissions remain visible", async () => {
    const query = resultQuery({ data: [{ submission_id: "submission", status: "pending", created_at: "date", submission: {
      status: "pending", pending_title: "draft", video: null,
    } }], count: 1, error: null });
    const result = await listHomeHeroFeatureRequests({ from: () => query } as unknown as Client, { status: "all" });
    expect(result.rows[0]).toMatchObject({ video_id: null, title: "draft", submission_status: "pending" });
    expect(query.eq).not.toHaveBeenCalled();
  });
  it("recovers out-of-range home hero pages while preserving the status filter", async () => {
    const page = resultQuery({ data: null, count: null, error: { code: "PGRST103", message: "range" } });
    const count = resultQuery({ data: null, count: 2, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(page).mockReturnValueOnce(count) };
    expect(await listHomeHeroFeatureRequests(client as unknown as Client, { status: "applied", page: 999 })).toEqual({ rows: [], total: 2 });
    expect(count.eq).toHaveBeenCalledWith("status", "applied");
  });
});

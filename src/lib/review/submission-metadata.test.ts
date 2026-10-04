import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchers = vi.hoisted(() => ({ bilibili: vi.fn(), youtube: vi.fn() }));
vi.mock("@/lib/bilibili/fetch-video-info", () => ({ fetchBilibiliVideoInfo: fetchers.bilibili }));
vi.mock("@/lib/youtube/fetch-video-info", () => ({ fetchYouTubeVideoInfo: fetchers.youtube }));

import { ensureSubmissionListMetadata } from "./queries";
import type { ReviewFetchedMeta } from "./fetched-meta";
import type { SubmissionListRow, SubmissionRow } from "./types";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
const metadata: ReviewFetchedMeta = {
  title: "视频标题", pic: "https://i0.hdslb.com/bfs/archive/cover.jpg", desc: "简介",
  ownerName: "作者", ownerAvatar: "avatar", viewCount: 10, likeCount: 2, duration: 125, pubdate: 1750000000,
};
function submission(id: string, overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id, user_id: "user", platform: "bilibili", storage_provider: "bilibili", external_id: id,
    source_url: null, status: "pending", auto_fetched_meta: {}, fetched_at: null, fetch_error: null,
    pending_title: null, pending_description: null, file_size: null, mime_type: null,
    source_ref: null, cover_ref: null, source_etag: null, cover_etag: null,
    reviewed_by: null, review_note: null, created_at: "2026-10-03T00:00:00Z", reviewed_at: null,
    ...overrides,
  };
}
function listRow(row: SubmissionRow): SubmissionListRow {
  const { auto_fetched_meta: meta } = row;
  return {
    ...row, fetched_title: meta.title ?? null, fetched_cover: meta.pic ?? null,
    fetched_author: meta.ownerName ?? null, fetched_duration: meta.duration ?? null,
  };
}
function clientFor(rows: SubmissionRow[]) {
  const writes: { id: string; values: Record<string, unknown> }[] = [];
  const queries: { in: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn(() => {
    let values: Record<string, unknown> | undefined;
    const query = {
      select: vi.fn(), in: vi.fn(), update: vi.fn(),
      eq: vi.fn((_column: string, id: string) => {
        if (values) { writes.push({ id, values }); }
        return query;
      }),
      then: (resolve: (result: unknown) => void) => Promise.resolve({ data: values ? null : rows, error: null }).then(resolve),
    };
    query.select.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.update.mockImplementation((update: Record<string, unknown>) => { values = update; return query; });
    queries.push(query);
    return query;
  });
  return { client: { from } as unknown as Client, from, writes, queries };
}

beforeEach(() => {
  vi.resetAllMocks();
  fetchers.bilibili.mockResolvedValue(metadata);
  fetchers.youtube.mockResolvedValue({ ...metadata, title: "YouTube 视频", duration: 60 });
});

describe("metadata when opening the submission queue", () => {
  it("fetches both external platforms and returns content in the same list response", async () => {
    const rows = [submission("bili"), submission("yt", { platform: "youtube", storage_provider: "youtube" })];
    const { client, writes, queries } = clientFor(rows);
    const result = await ensureSubmissionListMetadata(client, rows.map(listRow));
    expect(queries[0].in).toHaveBeenCalledExactlyOnceWith("id", ["bili", "yt"]);
    expect(fetchers.bilibili).toHaveBeenCalledExactlyOnceWith("bili");
    expect(fetchers.youtube).toHaveBeenCalledExactlyOnceWith("yt");
    expect(result[0]).toMatchObject({ fetched_title: metadata.title, fetched_cover: metadata.pic, fetched_author: "作者", fetched_duration: 125, fetch_error: null });
    expect(result[1]).toMatchObject({ fetched_title: "YouTube 视频", fetched_duration: 60, fetch_error: null });
    expect(result.every((row) => Boolean(row.fetched_at))).toBe(true);
    expect(writes).toHaveLength(2);
    expect(writes[0].values).toMatchObject({ auto_fetched_meta: metadata, fetch_error: null });
  });

  it("skips cached, failed, processed, original and unsupported submissions", async () => {
    const rows = [
      submission("cached", { auto_fetched_meta: metadata, fetched_at: "date" }),
      submission("failed", { fetch_error: "timeout" }),
      submission("approved", { status: "approved" }), submission("rejected", { status: "rejected" }),
      submission("original", { platform: "cos", storage_provider: "cos" }),
      submission("unsupported", { platform: "other", storage_provider: null }),
    ].map(listRow);
    const { client, from } = clientFor([]);
    expect(await ensureSubmissionListMetadata(client, rows)).toBe(rows);
    expect(from).not.toHaveBeenCalled();
    expect(fetchers.bilibili).not.toHaveBeenCalled();
    expect(fetchers.youtube).not.toHaveBeenCalled();
  });

  it("reuses metadata populated since the list snapshot without fetching or writing again", async () => {
    const cached = submission("cached", { auto_fetched_meta: metadata, fetched_at: "2026-10-03T01:00:00Z" });
    const { client, writes } = clientFor([cached]);
    const result = await ensureSubmissionListMetadata(client, [listRow(submission("cached"))]);
    expect(result[0]).toMatchObject({ fetched_title: metadata.title, fetched_at: cached.fetched_at });
    expect(fetchers.bilibili).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("does not fetch a submission reviewed since the list snapshot", async () => {
    const { client, writes } = clientFor([submission("reviewed", { status: "approved" })]);
    await ensureSubmissionListMetadata(client, [listRow(submission("reviewed"))]);
    expect(fetchers.bilibili).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("persists a source failure while still showing the other submission", async () => {
    fetchers.bilibili.mockRejectedValue(new Error("Bilibili 请求超时"));
    const rows = [submission("failed"), submission("success", { platform: "youtube", storage_provider: "youtube" })];
    const { client, writes } = clientFor(rows);
    const result = await ensureSubmissionListMetadata(client, rows.map(listRow));
    expect(result.map((row) => row.id)).toEqual(["failed", "success"]);
    expect(result[0]).toMatchObject({ fetched_at: null, fetch_error: "Bilibili 请求超时" });
    expect(result[1]).toMatchObject({ fetched_title: "YouTube 视频", fetch_error: null });
    expect(writes).toContainEqual({ id: "failed", values: { fetched_at: null, fetch_error: "Bilibili 请求超时" } });
  });

  it("limits simultaneous requests to four while loading the entire current page", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let peak = 0;
    fetchers.bilibili.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await gate;
      active--;
      return metadata;
    });
    const rows = Array.from({ length: 7 }, (_, index) => submission(String(index)));
    const { client } = clientFor(rows);
    const resultPromise = ensureSubmissionListMetadata(client, rows.map(listRow));
    await vi.waitFor(() => expect(fetchers.bilibili).toHaveBeenCalledTimes(4));
    release();
    const result = await resultPromise;
    expect(peak).toBe(4);
    expect(fetchers.bilibili).toHaveBeenCalledTimes(7);
    expect(result.every((row) => row.fetched_title === metadata.title)).toBe(true);
  });
});

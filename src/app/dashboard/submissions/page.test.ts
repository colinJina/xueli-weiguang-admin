import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionBatchListItem } from "@/lib/review/submission-list";
import type { SubmissionListRow } from "@/lib/review/types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), list: vi.fn(), hydrate: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/auth", () => ({ loadAdminPageData: mocks.load }));
vi.mock("@/lib/review/queries", () => ({
  listSubmissionsPage: mocks.list, ensureSubmissionListMetadata: mocks.hydrate,
  getSubmissionStorageProvider: (row: SubmissionListRow) => row.platform,
}));
vi.mock("@/lib/storage/cos/preview", () => ({ getCosPreviewUrl: vi.fn() }));
vi.mock("@/components/dashboard/notice", () => ({ Notice: () => null }));
vi.mock("@/components/dashboard/pagination", () => ({ Pagination: () => null }));
vi.mock("@/components/dashboard/submission-status-navigation", () => ({
  SubmissionStatusNavigation: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/dashboard/submissions-batch-list", () => ({
  SubmissionsBatchList: ({ items }: { items: SubmissionBatchListItem[] }) => React.createElement("section", null,
    items.map((item) => React.createElement("p", { key: item.id }, [item.title, item.author, item.duration, item.coverUrl].join(" ")))),
}));

import SubmissionsPage from "./page";

const row: SubmissionListRow = {
  id: "new-submission", platform: "bilibili", storage_provider: "bilibili", external_id: "BVtest",
  source_url: null, source_ref: null, pending_title: null, cover_ref: null, status: "pending",
  fetched_at: null, fetch_error: null, created_at: "2026-10-03T00:00:00Z",
  fetched_title: null, fetched_cover: null, fetched_author: null, fetched_duration: null,
};
const supabase = { client: "authorized" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockImplementation((load: (client: unknown) => Promise<unknown>) => load(supabase));
  mocks.list.mockResolvedValue({ rows: [row], total: 1 });
  mocks.hydrate.mockResolvedValue([{
    ...row, fetched_at: "date", fetched_title: "刚获取的视频标题", fetched_author: "视频作者",
    fetched_duration: 125, fetched_cover: "https://i0.hdslb.com/bfs/archive/cover.jpg",
  }]);
});

describe("opening the submission review menu", () => {
  it("renders fetched content on the initial list without opening a detail page", async () => {
    const page = await SubmissionsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith(supabase, [row]);
    expect(html).toContain("刚获取的视频标题");
    expect(html).toContain("视频作者");
    expect(html).toContain("2:05");
    expect(html).toContain("https://i0.hdslb.com/bfs/archive/cover.jpg");
    expect(html).not.toContain("待获取投稿标题");
  });

  it("waits for admin authorization before starting metadata writes", async () => {
    let authorize!: () => void;
    const authorization = new Promise<void>((resolve) => { authorize = resolve; });
    mocks.load.mockImplementation(async (load: (client: unknown) => Promise<unknown>) => {
      const data = await load(supabase);
      await authorization;
      return data;
    });
    const page = SubmissionsPage({ searchParams: Promise.resolve({}) });
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    expect(mocks.hydrate).not.toHaveBeenCalled();
    authorize();
    await page;
    expect(mocks.hydrate).toHaveBeenCalledOnce();
  });

  it("never starts fetching when authorization redirects to login", async () => {
    mocks.load.mockRejectedValue(new Error("redirect:/login"));
    await expect(SubmissionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });

  it("redirects an invalid page before fetching any metadata", async () => {
    await expect(SubmissionsPage({ searchParams: Promise.resolve({ page: "99" }) })).rejects.toThrow("redirect:/dashboard/submissions");
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });
});

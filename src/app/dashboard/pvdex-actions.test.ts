import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getSubmission: vi.fn(), dictionaries: vi.fn(),
  getSuggestions: vi.fn(), refreshCatalog: vi.fn(), createItem: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdminForAction: mocks.requireAdmin }));
vi.mock("@/lib/pvdex/catalog", () => ({ getPvdexSuggestions: mocks.getSuggestions, refreshPvdexCatalog: mocks.refreshCatalog }));
vi.mock("@/lib/review/dictionary-write", () => ({ createOrReuseReviewDictionaryItem: mocks.createItem }));
vi.mock("@/lib/review/queries", () => ({
  getSubmissionById: mocks.getSubmission, listAllDictionaries: mocks.dictionaries,
  isExternalSubmission: (submission: { platform: string }) => ["bilibili", "youtube"].includes(submission.platform),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => {
  if (error instanceof Error && error.message.startsWith("redirect:")) {
    throw error;
  }
} }));

import { createPvdexDictionaryItem, refreshPvdexSuggestions } from "./pvdex-actions";

const submissionId = "a1d603d9-0866-47e4-a37f-70ee2c5ad414";
const submission = { id: submissionId, platform: "bilibili", status: "pending", external_id: "BV1234567890" };
const item = { id: "new-tag", name: "手绘", created_at: "2026-10-03T00:00:00Z" };
const input = { submissionId, kind: "tags" as const, name: "手绘" };

describe("PVDex server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ supabase: "user-scoped-client", user: { id: "admin" } });
    mocks.getSubmission.mockResolvedValue(submission);
    mocks.createItem.mockResolvedValue({ item, reused: false });
    mocks.dictionaries.mockResolvedValue({ categories: [], tags: [] });
    mocks.getSuggestions.mockResolvedValue({ status: "not_found", message: "没有匹配" });
    mocks.refreshCatalog.mockResolvedValue(undefined);
  });

  it.each(["redirect:/login", "redirect:/login?error=not_admin"])("preserves auth redirects before any PVDex or dictionary access", async (message) => {
    mocks.requireAdmin.mockRejectedValue(new Error(message));
    await expect(createPvdexDictionaryItem(input)).rejects.toThrow(message);
    await expect(refreshPvdexSuggestions(submissionId)).rejects.toThrow(message);
    expect(mocks.getSubmission).not.toHaveBeenCalled();
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.refreshCatalog).not.toHaveBeenCalled();
    expect(mocks.getSuggestions).not.toHaveBeenCalled();
  });

  it("rejects invalid or missing submissions", async () => {
    expect(await createPvdexDictionaryItem({ ...input, submissionId: "not-a-uuid" }))
      .toEqual({ ok: false, error: "投稿不存在。" });
    expect(mocks.getSubmission).not.toHaveBeenCalled();
    mocks.getSubmission.mockResolvedValue(null);
    expect(await createPvdexDictionaryItem(input)).toEqual({ ok: false, error: "投稿不存在。" });
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("prevents processing already reviewed submissions", async (status) => {
    mocks.getSubmission.mockResolvedValue({ ...submission, status });
    expect(await createPvdexDictionaryItem(input)).toEqual({ ok: false, error: "只能为待审核投稿处理建议。" });
    expect(await refreshPvdexSuggestions(submissionId)).toEqual({ status: "unavailable", message: "只能为待审核投稿处理建议。" });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.refreshCatalog).not.toHaveBeenCalled();
  });

  it("blocks COS before reading the PVDex directory or creating dictionaries", async () => {
    mocks.getSubmission.mockResolvedValue({ ...submission, platform: "cos" });
    expect(await createPvdexDictionaryItem(input)).toEqual({ ok: false, error: "该投稿来源不支持 PVDex 建议。" });
    expect(await refreshPvdexSuggestions(submissionId)).toEqual({ status: "unavailable", message: "该投稿来源不支持 PVDex 建议。" });
    expect(mocks.refreshCatalog).not.toHaveBeenCalled();
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("returns newly created rows without invalidating the current review form", async () => {
    expect(await createPvdexDictionaryItem(input)).toEqual({ ok: true, item, reused: false });
    expect(mocks.createItem).toHaveBeenCalledWith("user-scoped-client", input);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/tags");
    expect(mocks.revalidate).not.toHaveBeenCalledWith(`/dashboard/submissions/${submissionId}`);
    expect(mocks.revalidate).not.toHaveBeenCalledWith("/dashboard/submissions/[id]", "page");
  });

  it("returns reused rows without cache invalidation", async () => {
    mocks.createItem.mockResolvedValue({ item, reused: true });
    expect(await createPvdexDictionaryItem(input)).toEqual({ ok: true, item, reused: true });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("returns validation/write errors without navigation or losing the client form", async () => {
    mocks.createItem.mockRejectedValue(new Error("名称已存在，请重新选择。"));
    expect(await createPvdexDictionaryItem(input))
      .toEqual({ ok: false, error: "名称已存在，请重新选择。" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects obsolete color dictionary creation requests", async () => {
    const legacyInput = { ...input, kind: "tones" } as unknown as Parameters<typeof createPvdexDictionaryItem>[0];
    expect(await createPvdexDictionaryItem(legacyInput))
      .toEqual({ ok: false, error: "建议面板仅支持创建标签，颜色直接加入视频色板。" });
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("refreshes only the public directory and reads the real submission", async () => {
    expect(await refreshPvdexSuggestions(submissionId)).toEqual({ status: "not_found", message: "没有匹配" });
    expect(mocks.getSubmission).toHaveBeenCalledWith("user-scoped-client", submissionId);
    expect(mocks.refreshCatalog).toHaveBeenCalledOnce();
    expect(mocks.getSuggestions).toHaveBeenCalledWith(submission, { categories: [], tags: [] });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("turns external refresh failures into an unavailable result", async () => {
    mocks.refreshCatalog.mockRejectedValue(new Error("PVDex 请求超时。"));
    expect(await refreshPvdexSuggestions(submissionId)).toEqual({ status: "unavailable", message: "PVDex 请求超时。" });
    expect(mocks.getSuggestions).not.toHaveBeenCalled();
  });
});

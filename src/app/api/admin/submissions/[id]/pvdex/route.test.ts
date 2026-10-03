import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminContext: vi.fn(), getSubmission: vi.fn(), dictionaries: vi.fn(), getSuggestions: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ getAdminContext: mocks.getAdminContext }));
vi.mock("@/lib/pvdex/catalog", () => ({ getPvdexSuggestions: mocks.getSuggestions }));
vi.mock("@/lib/review/queries", () => ({
  getSubmissionById: mocks.getSubmission, listAllDictionaries: mocks.dictionaries,
  isExternalSubmission: (submission: { platform: string }) => ["bilibili", "youtube"].includes(submission.platform),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { GET } from "./route";

const submissionId = "a1d603d9-0866-47e4-a37f-70ee2c5ad414";
const submission = { id: submissionId, platform: "youtube", external_id: "Cdbxt7L8zEM", auto_fetched_meta: {} };
const request = () => new Request(`https://admin.test/api/admin/submissions/${submissionId}/pvdex`);
const context = (id = submissionId) => ({ params: Promise.resolve({ id }) });
const matched = { status: "matched", fetchedAt: "2026-10-03T00:00:00Z", match: { id: "source", method: "primary" } };

describe("PVDex suggestion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminContext.mockResolvedValue({ supabase: "user-scoped-client", user: { id: "admin" }, isAdmin: true });
    mocks.getSubmission.mockResolvedValue(submission);
    mocks.dictionaries.mockResolvedValue({ categories: [], tags: [], tones: [] });
    mocks.getSuggestions.mockResolvedValue(matched);
  });

  it.each([
    { user: null, isAdmin: false, status: 401 },
    { user: { id: "regular-user" }, isAdmin: false, status: 403 },
  ])("uses explicit HTTP authorization failures without querying a submission", async ({ user, isAdmin, status }) => {
    mocks.getAdminContext.mockResolvedValue({ supabase: "user-scoped-client", user, isAdmin });
    const response = await GET(request(), context());
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getSubmission).not.toHaveBeenCalled();
    expect(mocks.dictionaries).not.toHaveBeenCalled();
    expect(mocks.getSuggestions).not.toHaveBeenCalled();
  });

  it("fails closed if the live role lookup fails", async () => {
    mocks.getAdminContext.mockRejectedValue(new Error("database failure"));
    const response = await GET(request(), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", message: "建议加载失败，请重试。" });
    expect(mocks.getSubmission).not.toHaveBeenCalled();
  });

  it("returns 404 for invalid IDs without a database query", async () => {
    const response = await GET(request(), context("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(mocks.getSubmission).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing submission", async () => {
    mocks.getSubmission.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.getSuggestions).not.toHaveBeenCalled();
  });

  it("reads only the true submission and returns suggestions with no-store", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual(matched);
    expect(mocks.getSubmission).toHaveBeenCalledWith("user-scoped-client", submissionId);
    expect(mocks.getSuggestions).toHaveBeenCalledWith(submission, { categories: [], tags: [], tones: [] });
    expect(submission.auto_fetched_meta).toEqual({});
  });

  it("does not fetch the directory or dictionaries for COS", async () => {
    mocks.getSubmission.mockResolvedValue({ ...submission, platform: "cos" });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unsupported", message: "该投稿来源不支持 PVDex 建议。" });
    expect(mocks.dictionaries).not.toHaveBeenCalled();
    expect(mocks.getSuggestions).not.toHaveBeenCalled();
  });

  it("keeps unavailable results separate from the existing metadata flow", async () => {
    mocks.getSuggestions.mockResolvedValue({ status: "unavailable", message: "PVDex 超时。" });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unavailable", message: "PVDex 超时。" });
    expect(submission.auto_fetched_meta).toEqual({});
  });

  it("does not leak database details in unexpected failures", async () => {
    mocks.dictionaries.mockRejectedValue(new Error("private table details"));
    const response = await GET(request(), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", message: "建议加载失败，请重试。" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

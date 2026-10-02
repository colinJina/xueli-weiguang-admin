import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }),
  fetchMetadata: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdminForAction: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("redirect:")) {
      throw error;
    }
  },
}));
vi.mock("@/lib/review/queries", () => ({
  fetchExternalSubmissionMetadata: mocks.fetchMetadata,
  getSubmissionById: vi.fn(),
  getSubmissionOrNotFound: vi.fn(),
  getSubmissionStorageProvider: (submission: { platform: string }) => submission.platform,
  isExternalSubmission: () => true,
}));
vi.mock("@/lib/storage/cos/publish", () => ({ publishCosSubmission: vi.fn() }));

import { batchApproveSubmissions, batchRejectSubmissions, rejectSubmission, updateDictionaryItem, updateToneItem, updateToneFamilyItem, deleteDictionaryItem, applyHomeHeroFeatureRequest, rejectHomeHeroFeatureRequest, addDictionaryItem } from "./actions";

function queryResult(data: unknown, error: { message: string; code?: string } | null = null, count = 0) {
  const result = { data, error, count };
  const query = {
    select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn(),
    then: (resolve: (result: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  for (const method of [query.select, query.update, query.insert, query.delete, query.eq, query.in]) {
    method.mockReturnValue(query);
  }
  query.maybeSingle.mockResolvedValue(result);
  return query;
}

function batchForm(ids = ["a", "b"]) {
  const form = new FormData();
  for (const id of ids) {
    form.append("submissionIds", id);
  }
  form.set("categoryId", "category");
  form.set("returnPath", "/dashboard/submissions?status=all&page=2");
  return form;
}

function destination() {
  return new URL(mocks.redirect.mock.lastCall![0], "https://admin.test");
}

describe("review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ supabase: { from: mocks.from, rpc: mocks.rpc }, user: { id: "admin" } });
    mocks.rpc.mockResolvedValue({ data: "video", error: null });
  });

  it("does not report rejection success if another administrator already reviewed the row", async () => {
    mocks.from.mockReturnValue(queryResult([]));
    const form = new FormData();
    form.set("submissionId", "a");
    await expect(rejectSubmission(form)).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("error")).toContain("已被审核");
    expect(destination().searchParams.has("notice")).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reads a batch in one request and retains filter/page after successful publication", async () => {
    const query = queryResult(["a", "b"].map((id) => ({ id, platform: "bilibili", status: "pending", fetched_at: "cached" })));
    mocks.from.mockReturnValue(query);
    await expect(batchApproveSubmissions(batchForm())).rejects.toThrow("redirect:");
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
    expect(destination().searchParams.get("status")).toBe("all");
    expect(destination().searchParams.get("page")).toBe("2");
    expect(destination().searchParams.get("notice")).toBe("已通过 2 条投稿。");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/submissions/[id]", "page");
  });

  it("never republishes approved or rejected rows, and reports missing rows", async () => {
    mocks.from.mockReturnValue(queryResult([{ id: "a", status: "approved" }, { id: "b", status: "rejected" }]));
    await expect(batchApproveSubmissions(batchForm(["a", "b", "missing"]))).rejects.toThrow("redirect:");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(destination().searchParams.get("error")).toContain("3 条失败");
  });

  it("reports partial approval accurately", async () => {
    mocks.from.mockReturnValue(queryResult(["a", "b"].map((id) => ({ id, platform: "youtube", status: "pending", fetched_at: "cached" }))));
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "已被审核" } });
    await expect(batchApproveSubmissions(batchForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("notice")).toContain("已通过 1 条，1 条失败");
  });

  it("counts only rows actually rejected, keeping current navigation", async () => {
    mocks.from.mockReturnValueOnce(queryResult([{ id: "a" }])).mockReturnValueOnce(queryResult([]));
    await expect(batchRejectSubmissions(batchForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("notice")).toContain("已拒绝 1 条投稿。1 条不存在或已被审核");
    expect(destination().searchParams.get("status")).toBe("all");
    expect(destination().searchParams.get("page")).toBe("2");
  });

  it("reports stale batch rejections as an error", async () => {
    mocks.from.mockReturnValue(queryResult([]));
    await expect(batchRejectSubmissions(batchForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("error")).toContain("已拒绝 0 条投稿");
    expect(mocks.from).toHaveBeenCalledOnce();
  });

  it("blocks all reads and writes when action authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect:/login"));
    await expect(batchApproveSubmissions(batchForm())).rejects.toThrow("redirect:/login");
    await expect(batchRejectSubmissions(batchForm())).rejects.toThrow("redirect:/login");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("other menu mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ supabase: { from: mocks.from, rpc: mocks.rpc }, user: { id: "admin" } });
    mocks.rpc.mockResolvedValue({ data: "feature", error: null });
  });
  function dictionaryForm() {
    const form = new FormData();
    for (const [key, value] of Object.entries({ id: "item", name: "雪", key: "snow", familyId: "family", manualColorHex: "#FFFFFF", sortOrder: "2", returnPath: "/dashboard/categories?q=雪" })) {
      form.set(key, value);
    }
    return form;
  }
  it("preserves the filter after a category edit and refreshes dependent menus", async () => {
    const query = queryResult({ id: "item" });
    mocks.from.mockReturnValue(query);
    await expect(updateDictionaryItem("categories", dictionaryForm())).rejects.toThrow("redirect:");
    expect(query.update).toHaveBeenCalledWith({ name: "雪", sort_order: 2 });
    expect(destination().searchParams.get("q")).toBe("雪");
    expect(destination().searchParams.get("notice")).toBe("条目已更新。");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/tones");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/submissions/[id]", "page");
  });
  it("does not report success for missing dictionary, tone or family rows", async () => {
    mocks.from.mockReturnValue(queryResult(null));
    for (const action of [updateDictionaryItem.bind(null, "tags"), updateToneItem, updateToneFamilyItem]) {
      await expect(action(dictionaryForm())).rejects.toThrow("redirect:");
      expect(destination().searchParams.get("error")).toContain("已不存在");
      expect(destination().searchParams.has("notice")).toBe(false);
    }
  });
  it("translates unique constraint failures into a useful message", async () => {
    mocks.from.mockReturnValue(queryResult(null, { code: "23505", message: "duplicate key" }));
    await expect(addDictionaryItem("tags", dictionaryForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("error")).toContain("已存在");
  });
  it("prevents deletion of a family that still has tones", async () => {
    const usage = queryResult(null, null, 3);
    mocks.from.mockReturnValue(usage);
    await expect(deleteDictionaryItem("tone_families", dictionaryForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("error")).toContain("仍有色调归属");
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(usage.delete).not.toHaveBeenCalled();
  });
  it("reports stale deletion instead of a false success", async () => {
    mocks.from.mockReturnValueOnce(queryResult(null)).mockReturnValueOnce(queryResult(null));
    await expect(deleteDictionaryItem("tags", dictionaryForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("error")).toContain("已不存在");
  });
  it("retains home hero status and page on success and RPC conflict", async () => {
    const form = new FormData();
    form.set("submissionId", "submission");
    form.set("returnPath", "/dashboard/home-hero?status=all&page=2");
    await expect(applyHomeHeroFeatureRequest(form)).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("status")).toBe("all");
    expect(destination().searchParams.get("page")).toBe("2");
    mocks.rpc.mockResolvedValue({ error: { message: "Only pending requests can be rejected." } });
    await expect(rejectHomeHeroFeatureRequest(form)).rejects.toThrow("redirect:");
    expect(destination().searchParams.has("notice")).toBe(false);
    expect(destination().searchParams.get("error")).toContain("Only pending");
  });
  it("checks action authorization before any menu mutation", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect:/login"));
    await expect(updateToneItem(dictionaryForm())).rejects.toThrow("redirect:/login");
    await expect(updateDictionaryItem("categories", dictionaryForm())).rejects.toThrow("redirect:/login");
    await expect(deleteDictionaryItem("tags", dictionaryForm())).rejects.toThrow("redirect:/login");
    const form = dictionaryForm();
    form.set("submissionId", "submission");
    await expect(applyHomeHeroFeatureRequest(form)).rejects.toThrow("redirect:/login");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

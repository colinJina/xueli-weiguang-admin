import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }),
  fetchMetadata: vi.fn(),
  getSubmission: vi.fn(),
  getSubmissionOrNotFound: vi.fn(),
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
  getSubmissionById: mocks.getSubmission,
  getSubmissionOrNotFound: mocks.getSubmissionOrNotFound,
  getSubmissionStorageProvider: (submission: { platform: string }) => submission.platform,
  isExternalSubmission: () => true,
}));
vi.mock("@/lib/storage/cos/publish", () => ({ publishCosSubmission: vi.fn() }));

import { approveSubmission, batchApproveSubmissions, batchRejectSubmissions, rejectSubmission, updateDictionaryItem, updateToneItem, deleteDictionaryItem, applyHomeHeroFeatureRequest, rejectHomeHeroFeatureRequest, addDictionaryItem } from "./actions";

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

describe("single submission publication regression", () => {
  const sourceMetadata = Object.freeze({
    title: "原平台标题", pic: "https://example.test/original-cover.jpg", desc: "原平台简介",
    ownerName: "原平台上传者", ownerAvatar: "https://example.test/avatar.jpg",
    viewCount: 1234, likeCount: 56, duration: 120, pubdate: 1750000000,
  });
  const submission = (overrides: Record<string, unknown> = {}) => ({
    id: "submission", platform: "bilibili", storage_provider: "bilibili", status: "pending",
    auto_fetched_meta: sourceMetadata, fetched_at: "2026-10-03T00:00:00Z", fetch_error: null,
    ...overrides,
  });
  function reviewForm() {
    const form = new FormData();
    form.set("submissionId", "submission");
    form.set("categoryId", "category");
    for (const id of ["tag-1", "tag-2", "tag-3", "tag-4"]) {
      form.append("tagIds", id);
    }
    form.set("palette", JSON.stringify([
      { hex: "abcdef", percentage: 0.5 },
      { hex: "#123456", percentage: null },
      { hex: "#FFFFFF", percentage: null },
    ]));
    form.set("reviewNote", "  已核实 PVDex 建议  ");
    // Suggestions are client-side candidates. Extra request fields must never
    // replace source metadata or become extra publish RPC arguments.
    form.set("pvdexSuggestion", JSON.stringify({
      title: "PVDex 标题", tags: ["建议标签"], colors: [{ hex: "#ABCDEF", percentage: 0.5 }],
    }));
    return form;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ supabase: { from: mocks.from, rpc: mocks.rpc }, user: { id: "admin" } });
    mocks.getSubmission.mockResolvedValue(submission());
    mocks.rpc.mockResolvedValue({ data: "published-video", error: null });
  });

  it.each(["bilibili", "youtube"])("preserves source metadata and original publish arguments for %s", async (platform) => {
    const row = submission({ platform, storage_provider: platform });
    mocks.getSubmission.mockResolvedValue(row);
    const originalMetadata = JSON.stringify(row.auto_fetched_meta);
    await expect(approveSubmission(reviewForm())).rejects.toThrow("redirect:");
    expect(mocks.getSubmission).toHaveBeenCalledWith({ from: mocks.from, rpc: mocks.rpc }, "submission");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("approve_submission_with_palette", {
      p_submission_id: "submission", p_category_id: "category",
      p_tag_ids: ["tag-1", "tag-2", "tag-3", "tag-4"],
      p_palette: [
        { hex: "#ABCDEF", percentage: 0.5 },
        { hex: "#123456", percentage: null },
        { hex: "#FFFFFF", percentage: null },
      ],
      p_review_note: "已核实 PVDex 建议",
    });
    expect(row.auto_fetched_meta).toBe(sourceMetadata);
    expect(JSON.stringify(row.auto_fetched_meta)).toBe(originalMetadata);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
    expect(destination().pathname).toBe("/dashboard/submissions");
    expect(destination().searchParams.get("notice")).toBe("投稿已通过。");
    expect(destination().searchParams.has("error")).toBe(false);
  });

  it.each([
    { kind: "category", error: "必须选择分类。" },
    { kind: "tags", error: "最多选择 4 个条目。" },
    { kind: "colors", error: "色板必须是最多 5 个颜色的列表。" },
  ])("blocks publication before RPC when $kind violates review limits", async ({ kind, error }) => {
    const form = reviewForm();
    if (kind === "category") {
      form.delete("categoryId");
    } else if (kind === "tags") {
      form.append("tagIds", "tag-5");
    } else {
      form.set("palette", JSON.stringify(["112233", "223344", "334455", "445566", "556677", "667788"].map((hex) => ({ hex }))));
    }
    await expect(approveSubmission(form)).rejects.toThrow("redirect:");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(destination().pathname).toBe("/dashboard/submissions/submission");
    expect(destination().searchParams.get("error")).toBe(error);
    expect(destination().searchParams.has("notice")).toBe(false);
  });

  it.each([
    { fetched_at: null, fetch_error: "原平台请求超时", metadata: {}, message: "Fetch metadata before approving." },
    { fetched_at: "2026-10-03T00:00:00Z", fetch_error: "原平台请求超时", metadata: sourceMetadata, message: "Resolve metadata fetch error before approving." },
    { fetched_at: "2026-10-03T00:00:00Z", fetch_error: null, metadata: { title: "只有 PVDex 标题" }, message: "Cached metadata is incomplete." },
  ])("preserves the metadata RPC rejection despite available PVDex candidates: $message", async ({ fetched_at, fetch_error, metadata, message }) => {
    const row = submission({ fetched_at, fetch_error, auto_fetched_meta: metadata });
    mocks.getSubmission.mockResolvedValue(row);
    // These are the existing approve_submission procedure's error messages.
    // PVDex must neither bypass that procedure nor swallow its rejection.
    mocks.rpc.mockResolvedValue({ data: null, error: { message, code: "22023" } });
    await expect(approveSubmission(reviewForm())).rejects.toThrow("redirect:");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("approve_submission_with_palette", {
      p_submission_id: "submission", p_category_id: "category",
      p_tag_ids: ["tag-1", "tag-2", "tag-3", "tag-4"],
      p_palette: [
        { hex: "#ABCDEF", percentage: 0.5 },
        { hex: "#123456", percentage: null },
        { hex: "#FFFFFF", percentage: null },
      ], p_review_note: "已核实 PVDex 建议",
    });
    expect(row.auto_fetched_meta).toBe(metadata);
    expect(row.fetched_at).toBe(fetched_at);
    expect(row.fetch_error).toBe(fetch_error);
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(destination().searchParams.get("error")).toBe(message);
    expect(destination().searchParams.has("notice")).toBe(false);
  });

  it.each(["approved", "rejected"])("never republishes a %s submission", async (status) => {
    mocks.getSubmission.mockResolvedValue(submission({ status }));
    await expect(approveSubmission(reviewForm())).rejects.toThrow("redirect:");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
    expect(destination().searchParams.get("error")).toBe("只能审核待处理投稿。");
  });

  it("reports a removed submission without publishing", async () => {
    mocks.getSubmission.mockResolvedValue(null);
    await expect(approveSubmission(reviewForm())).rejects.toThrow("redirect:");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(destination().searchParams.get("error")).toBe("投稿不存在。");
  });

  it("requires action authorization before reading or publishing a submission", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("redirect:/login?error=not_admin"));
    await expect(approveSubmission(reviewForm())).rejects.toThrow("redirect:/login?error=not_admin");
    expect(mocks.getSubmission).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

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
    const form = batchForm();
    const palette = ["#112233", "#223344", "#334455", "#445566", "#556677"].map((hex) => ({ hex, percentage: null }));
    form.set("palette", JSON.stringify(palette));
    await expect(batchApproveSubmissions(form)).rejects.toThrow("redirect:");
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    for (const id of ["a", "b"]) {
      expect(mocks.rpc).toHaveBeenCalledWith("approve_submission_with_palette", {
        p_submission_id: id, p_category_id: "category", p_tag_ids: [], p_palette: palette, p_review_note: null,
      });
    }
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
    for (const [key, value] of Object.entries({ id: "item", name: "雪", manualColorHex: "#FFFFFF", sortOrder: "2", returnPath: "/dashboard/categories?q=雪" })) {
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
  it("does not report success for missing dictionary or tone rows", async () => {
    mocks.from.mockReturnValue(queryResult(null));
    for (const action of [updateDictionaryItem.bind(null, "tags"), updateToneItem]) {
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
  it("creates a color with a HEX name when the optional name is blank", async () => {
    const query = queryResult(null);
    mocks.from.mockReturnValue(query);
    const form = dictionaryForm();
    form.set("name", "  ");
    form.set("manualColorHex", "abcdef");
    await expect(addDictionaryItem("tones", form)).rejects.toThrow("redirect:");
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("tones");
    expect(query.insert).toHaveBeenCalledWith({ name: "#ABCDEF", color_hex: "#ABCDEF" });
    expect(destination().searchParams.get("notice")).toBe("条目已添加。");
  });
  it("prevents deletion of a color used by videos", async () => {
    const usage = queryResult(null, null, 3);
    mocks.from.mockReturnValue(usage);
    await expect(deleteDictionaryItem("tones", dictionaryForm())).rejects.toThrow("redirect:");
    expect(destination().searchParams.get("error")).toContain("视频");
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

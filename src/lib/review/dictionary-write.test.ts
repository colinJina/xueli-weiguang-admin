import { describe, expect, it, vi } from "vitest";

import { createOrReuseReviewDictionaryItem, insertDictionaryRecord } from "./dictionary-write";
import type { DictionaryItem } from "@/lib/review/types";

const item = (overrides: Partial<DictionaryItem> = {}): DictionaryItem => ({
  id: "dictionary-item", name: "手绘", created_at: "2026-10-03T00:00:00Z", ...overrides,
});

function query(data: unknown, error: { code?: string; message: string } | null = null) {
  const result = { data, error };
  const chain = {
    select: vi.fn(), order: vi.fn(), range: vi.fn(), eq: vi.fn(), insert: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  for (const method of [chain.select, chain.order, chain.range, chain.eq, chain.insert]) {
    method.mockReturnValue(chain);
  }
  return chain;
}

function client(...queries: ReturnType<typeof query>[]) {
  const from = vi.fn();
  for (const value of queries) {
    from.mockReturnValueOnce(value);
  }
  return { from } as unknown as Parameters<typeof createOrReuseReviewDictionaryItem>[0];
}

describe("review dictionary writes", () => {
  it("reuses tags after whitespace/case normalization without inserting", async () => {
    const existing = item({ name: "  Motion Design  " });
    const read = query([existing]);
    const supabase = client(read);
    await expect(createOrReuseReviewDictionaryItem(supabase, { kind: "tags", name: "motion design" }))
      .resolves.toEqual({ item: existing, reused: true });
    expect(read.insert).not.toHaveBeenCalled();
  });

  it("refuses ambiguous tag or color matches", async () => {
    await expect(createOrReuseReviewDictionaryItem(client(query([
      item({ name: "Motion" }), item({ id: "second", name: " motion " }),
    ])), { kind: "tags", name: "motion" })).rejects.toThrow("多个同名标签");
    await expect(createOrReuseReviewDictionaryItem(client(query([
      item({ color_hex: "#ABCDEF" }), item({ id: "second", color_hex: "#abcdef" }),
    ])), { kind: "tones", name: "", colorHex: "abcdef" }))
      .rejects.toThrow("多个相同色值");
  });

  it("reuses colors only by HEX, regardless of the proposed name", async () => {
    const existing = item({ name: "蓝灰", color_hex: "#ABCDEF" });
    const read = query([existing]);
    await expect(createOrReuseReviewDictionaryItem(client(read), {
      kind: "tones", name: "其他名称", colorHex: "ABCDEF",
    })).resolves.toEqual({ item: existing, reused: true });
    expect(read.insert).not.toHaveBeenCalled();
    expect(read.eq).toHaveBeenCalledWith("color_hex", "#ABCDEF");
    expect(read.range).not.toHaveBeenCalled();
  });

  it("creates a trimmed tag and returns the inserted row", async () => {
    const inserted = item();
    const write = query(inserted);
    await expect(createOrReuseReviewDictionaryItem(client(query([]), write), { kind: "tags", name: " 手绘 " }))
      .resolves.toEqual({ item: inserted, reused: false });
    expect(write.insert).toHaveBeenCalledWith({ name: "手绘" });
    expect(write.select).toHaveBeenCalledWith("id,name,created_at");
  });

  it("creates colors directly with HEX names and no family lookup", async () => {
    const inserted = item({ name: "#ABCDEF", color_hex: "#ABCDEF" });
    const write = query(inserted);
    const supabase = client(query([]), write);
    const result = await createOrReuseReviewDictionaryItem(supabase, {
      kind: "tones", name: "  ", colorHex: "abcdef",
    });
    expect(result).toEqual({ item: inserted, reused: false });
    expect(supabase.from).toHaveBeenNthCalledWith(1, "tones");
    expect(supabase.from).toHaveBeenNthCalledWith(2, "tones");
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(write.insert).toHaveBeenCalledWith({ name: "#ABCDEF", color_hex: "#ABCDEF" });
  });

  it("re-reads and reuses a concurrently inserted tag after 23505", async () => {
    const existing = item();
    await expect(createOrReuseReviewDictionaryItem(client(
      query([]), query(null, { code: "23505", message: "duplicate" }), query([existing]),
    ), { kind: "tags", name: "手绘" })).resolves.toEqual({ item: existing, reused: true });
  });

  it("re-reads an exact color after concurrent creation", async () => {
    const existing = item({ name: "蓝", color_hex: "#ABCDEF" });
    await expect(createOrReuseReviewDictionaryItem(client(
      query([]), query(null, { code: "23505", message: "duplicate" }), query([existing]),
    ), { kind: "tones", name: "蓝", colorHex: "#abcdef" }))
      .resolves.toEqual({ item: existing, reused: true });
  });

  it("never mistakes an unrelated uniqueness conflict for successful reuse", async () => {
    await expect(createOrReuseReviewDictionaryItem(client(
      query([]), query(null, { code: "23505", message: "duplicate" }),
      query([item({ name: "蓝", color_hex: "#000000" })]),
    ), { kind: "tones", name: "蓝", colorHex: "#ABCDEF" })).rejects.toThrow("已存在");
  });

  it("propagates read and insertion failures", async () => {
    await expect(createOrReuseReviewDictionaryItem(client(query(null, { message: "read failed" })), {
      kind: "tags", name: "手绘",
    })).rejects.toThrow("read failed");
    await expect(createOrReuseReviewDictionaryItem(client(query([]), query(null, { message: "write failed" })), {
      kind: "tags", name: "手绘",
    })).rejects.toThrow("write failed");
  });

  it("finds matches beyond the first dictionary page", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => item({ id: `tag-${index}`, name: `标签 ${index}` }));
    const nextPage = query([item()]);
    await expect(createOrReuseReviewDictionaryItem(client(query(firstPage), nextPage), {
      kind: "tags", name: "手绘",
    })).resolves.toEqual({ item: item(), reused: true });
    expect(nextPage.range).toHaveBeenCalledWith(500, 999);
  });

  it("treats PostgREST out-of-range as the end of an exact-size page", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => item({ id: `tag-${index}`, name: `标签 ${index}` }));
    firstPage[0] = item();
    await expect(createOrReuseReviewDictionaryItem(client(
      query(firstPage), query(null, { code: "PGRST103", message: "range not satisfiable" }),
    ), { kind: "tags", name: "手绘" })).resolves.toEqual({ item: item(), reused: true });
  });

  it("validates name length and color before any database access", async () => {
    const supabase = client();
    await expect(createOrReuseReviewDictionaryItem(supabase, { kind: "tags", name: "字".repeat(41) }))
      .rejects.toThrow("40");
    await expect(createOrReuseReviewDictionaryItem(supabase, { kind: "tones", name: "蓝", colorHex: "invalid" }))
      .rejects.toThrow("HEX");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("keeps maintenance inserts free of reuse reads or returning-select changes", async () => {
    const write = query(null, { code: "23505", message: "duplicate" });
    const supabase = client(write);
    await expect(insertDictionaryRecord(supabase, "tags", { name: "手绘" }))
      .resolves.toEqual({ item: null, error: { code: "23505", message: "duplicate" } });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(write.select).not.toHaveBeenCalled();
  });
});

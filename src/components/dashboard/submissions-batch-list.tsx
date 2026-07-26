"use client";

import Link from "next/link";
import { useState } from "react";

import { batchApproveSubmissions, batchRejectSubmissions } from "@/app/dashboard/actions";
import { PendingButton } from "@/components/dashboard/pending-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { SubmissionStatus } from "@/lib/review/types";

export type SubmissionBatchListItem = {
  id: string;
  status: SubmissionStatus;
  createdAt: string;
  sourceLabel: string;
  sourceDetail: string | null;
  metadataLabel: string;
};

type DictionaryOption = {
  id: string;
  name: string;
};

type ToneOption = DictionaryOption & {
  color_hex?: string | null;
  family_name?: string | null;
};

type SubmissionsBatchListProps = {
  categories: DictionaryOption[];
  items: SubmissionBatchListItem[];
  tags: DictionaryOption[];
  tones: ToneOption[];
};

const MAX_TAGS = 4;
const MAX_TONES = 3;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function SubmissionsBatchList({ categories, items, tags, tones }: SubmissionsBatchListProps) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedToneIds, setSelectedToneIds] = useState<ReadonlySet<string>>(new Set());

  const pendingIds = items
    .filter((item) => item.status === "pending")
    .map((item) => item.id);
  const selectedCount = pendingIds.filter((id) => selectedIds.has(id)).length;
  const allPendingSelected = pendingIds.length > 0 && selectedCount === pendingIds.length;

  const toggleId = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const toggleAllPending = () => {
    setSelectedIds(allPendingSelected ? new Set() : new Set(pendingIds));
  };

  const toggleLimitedId = (
    setSelected: typeof setSelectedTagIds,
    id: string,
    limit: number,
  ) => {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < limit) {
        next.add(id);
      }

      return next;
    });
  };

  return (
    <form action={batchApproveSubmissions}>
      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[36px_1.2fr_1fr_130px_120px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle md:grid">
          <span className="flex items-center">
            <input
              aria-label="全选本页待审核"
              checked={allPendingSelected}
              className="h-4 w-4 accent-white"
              disabled={pendingIds.length === 0}
              onChange={toggleAllPending}
              type="checkbox"
            />
          </span>
          <span>来源</span>
          <span>提交时间</span>
          <span>元数据</span>
          <span>状态</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <div
              className="grid grid-cols-[36px_1fr] items-start gap-2 border-b border-border px-4 py-3 text-sm transition last:border-b-0 hover:bg-panel md:grid-cols-[36px_1.2fr_1fr_130px_120px] md:items-center"
              key={item.id}
            >
              <span className="flex items-center pt-1 md:pt-0">
                {item.status === "pending" ? (
                  <input
                    aria-label="选择该投稿"
                    checked={selectedIds.has(item.id)}
                    className="h-4 w-4 accent-white"
                    name="submissionIds"
                    onChange={() => toggleId(item.id)}
                    type="checkbox"
                    value={item.id}
                  />
                ) : null}
              </span>
              <Link
                className="col-start-2 grid gap-2 md:col-span-4 md:grid-cols-[1.2fr_1fr_130px_120px] md:items-center"
                href={`/dashboard/submissions/${item.id}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{item.sourceLabel}</span>
                  {item.sourceDetail ? (
                    <span className="mt-1 block truncate text-xs text-subtle">
                      {item.sourceDetail}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted">{item.createdAt}</span>
                <span className="text-muted">{item.metadataLabel}</span>
                <StatusBadge status={item.status} />
              </Link>
            </div>
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">暂无投稿。</p>
            <p className="mt-2 text-sm text-muted">用户提交的外链和原创投稿会显示在这里。</p>
          </div>
        )}
      </section>

      {selectedCount > 0 ? (
        <>
          <div aria-hidden="true" className="h-48 md:h-40" />
          <div className="admin-fade-in-up fixed inset-x-0 bottom-0 z-40 border-t border-borderStrong bg-background/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-subtle">
                  已选 {selectedCount} 条待审核投稿
                </p>
                <button
                  className="text-xs text-subtle underline-offset-4 transition hover:text-foreground hover:underline"
                  onClick={() => setSelectedIds(new Set())}
                  type="button"
                >
                  清除选择
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-subtle">
                    分类（批量通过必选）
                  </span>
                  <select className="admin-input" name="categoryId" required>
                    <option value="">选择分类</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-subtle">
                    审核备注（可选，通过与拒绝共用）
                  </span>
                  <input className="admin-input" name="reviewNote" type="text" />
                </label>

                <div className="flex gap-2">
                  <PendingButton className="admin-button" pendingText="批量通过中…">
                    批量通过
                  </PendingButton>
                  <PendingButton
                    className="admin-secondary-button h-10"
                    formAction={batchRejectSubmissions}
                    formNoValidate
                    pendingText="批量拒绝中…"
                  >
                    批量拒绝
                  </PendingButton>
                </div>
              </div>

              <details className="border border-border bg-surface">
                <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-[0.16em] text-subtle transition hover:text-foreground">
                  标签 / 色调（可选，应用到全部选中项）
                </summary>
                <div className="grid gap-4 border-t border-border p-3 lg:grid-cols-2">
                  <fieldset className="space-y-2">
                    <legend className="text-xs uppercase tracking-[0.16em] text-subtle">
                      标签，最多 {MAX_TAGS} 个
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tags.length ? (
                        tags.map((tag) => {
                          const checked = selectedTagIds.has(tag.id);
                          const disabled = !checked && selectedTagIds.size >= MAX_TAGS;

                          return (
                            <label
                              className={`flex items-center gap-2 border border-border bg-panel px-3 py-2 ${
                                disabled ? "opacity-40" : ""
                              }`}
                              key={tag.id}
                            >
                              <input
                                checked={checked}
                                className="h-4 w-4 accent-white"
                                disabled={disabled}
                                name="tagIds"
                                onChange={() =>
                                  toggleLimitedId(setSelectedTagIds, tag.id, MAX_TAGS)
                                }
                                type="checkbox"
                                value={tag.id}
                              />
                              <span className="text-sm text-muted">{tag.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted">暂无条目。</p>
                      )}
                    </div>
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className="text-xs uppercase tracking-[0.16em] text-subtle">
                      色调，最多 {MAX_TONES} 个
                    </legend>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {tones.length ? (
                        tones.map((tone) => {
                          const checked = selectedToneIds.has(tone.id);
                          const disabled = !checked && selectedToneIds.size >= MAX_TONES;

                          return (
                            <label
                              className={`flex cursor-pointer flex-col items-center gap-2 border border-border bg-panel px-2 py-3 transition hover:border-muted ${
                                disabled ? "cursor-not-allowed opacity-40" : ""
                              }`}
                              key={tone.id}
                            >
                              <input
                                checked={checked}
                                className="peer sr-only"
                                disabled={disabled}
                                name="toneIds"
                                onChange={() =>
                                  toggleLimitedId(setSelectedToneIds, tone.id, MAX_TONES)
                                }
                                type="checkbox"
                                value={tone.id}
                              />
                              <span
                                aria-hidden="true"
                                className="h-9 w-9 rounded-full border border-borderStrong shadow-[0_0_0_4px_rgba(255,255,255,0.04)] transition peer-checked:scale-95 peer-checked:border-foreground peer-checked:shadow-[0_0_0_4px_rgba(255,255,255,0.18)]"
                                style={{ backgroundColor: getToneColor(tone) }}
                              />
                              <span className="max-w-full truncate text-center text-xs text-muted peer-checked:text-foreground">
                                {tone.name}
                              </span>
                              {tone.family_name ? (
                                <span className="max-w-full truncate text-center text-[0.68rem] text-subtle">
                                  {tone.family_name}
                                </span>
                              ) : null}
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted">暂无条目。</p>
                      )}
                    </div>
                  </fieldset>
                </div>
              </details>
            </div>
          </div>
        </>
      ) : null}
    </form>
  );
}

function getToneColor(tone: { color_hex?: string | null; name: string }) {
  const color = tone.color_hex ?? tone.name;
  return HEX_COLOR_PATTERN.test(color) ? color : "#D4D4D4";
}

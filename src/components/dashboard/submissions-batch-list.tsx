"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { batchApproveSubmissions, batchRejectSubmissions } from "@/app/dashboard/actions";
import { CoverPreview } from "@/components/dashboard/cover-preview";
import { PendingButton } from "@/components/dashboard/pending-button";
import { ReviewPaletteEditor } from "@/components/dashboard/review-palette-editor";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { ReviewPaletteColor } from "@/lib/review/palette";
import type { SubmissionBatchListItem } from "@/lib/review/submission-list";
import type { SubmissionStatusFilter } from "@/lib/review/types";

type DictionaryOption = {
  id: string;
  name: string;
};

type SubmissionsBatchListProps = {
  items: SubmissionBatchListItem[];
  returnPath: string;
  status: SubmissionStatusFilter;
};

type ReviewOptions = {
  categories: DictionaryOption[];
  tags: DictionaryOption[];
};

const MAX_TAGS = 4;
export function SubmissionsBatchList({ items, returnPath, status }: SubmissionsBatchListProps) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlySet<string>>(new Set());
  const [palette, setPalette] = useState<ReviewPaletteColor[]>([]);
  const [options, setOptions] = useState<ReviewOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const { categories = [], tags = [] } = options ?? {};

  const pendingIds = items
    .filter((item) => item.status === "pending")
    .map((item) => item.id);
  const selectedCount = pendingIds.filter((id) => selectedIds.has(id)).length;
  const allPendingSelected = pendingIds.length > 0 && selectedCount === pendingIds.length;
  const hasSelection = selectedCount > 0;

  // Load publishing options only when the administrator actually selects rows.
  // Keep them for this list view, and cancel when changing status/page or clearing.
  useEffect(() => {
    if (!hasSelection || options) {
      return;
    }
    const controller = new AbortController();
    setOptionsError("");
    async function loadOptions() {
      try {
        const response = await fetch("/api/admin/review-options", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("审核选项加载失败，请重试或重新登录。");
        }
        const data: ReviewOptions = await response.json();
        if (!controller.signal.aborted) {
          setOptions(data);
        }
      } catch (_error) {
        if (!controller.signal.aborted) {
          setOptionsError("审核选项加载失败，请重试或重新登录。");
        }
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [hasSelection, options, optionsAttempt]);

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
      <input name="returnPath" type="hidden" value={returnPath} />
      <section className="overflow-hidden admin-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel px-4 py-3 text-xs text-subtle sm:px-5">
          <div className="flex items-center gap-4">
            {pendingIds.length > 0 ? (
              <label className="flex cursor-pointer items-center gap-3 text-muted">
                <input
                  aria-label="全选本页待审核"
                  checked={allPendingSelected}
                  className="h-4 w-4 accent-foreground"
                  onChange={toggleAllPending}
                  ref={(element) => { if (element) { element.indeterminate = selectedCount > 0 && !allPendingSelected; } }}
                  type="checkbox"
                />
                全选本页待审核
              </label>
            ) : <span className="font-medium text-muted">投稿内容</span>}
            <span>本页 {items.length} 条</span>
          </div>
          {pendingIds.length > 0 ? <span>勾选后可批量审核</span> : null}
        </div>
        {items.length ? (
          items.map((item, index) => (
            <div
              className={`grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3 gap-y-4 border-b border-border px-4 py-5 text-sm transition-colors last:border-b-0 sm:px-5 lg:grid-cols-[20px_minmax(0,1fr)_136px_104px] lg:items-center lg:gap-x-5 ${selectedIds.has(item.id) ? "bg-panelHover shadow-[inset_3px_0_0_var(--text-2)]" : "hover:bg-panel"}`}
              key={item.id}
            >
              <span className="flex min-h-5 items-center pt-1 lg:pt-0">
                {item.status === "pending" ? (
                  <input
                    aria-label={`选择投稿：${item.title}`}
                    checked={selectedIds.has(item.id)}
                    className="h-4 w-4 accent-foreground"
                    name="submissionIds"
                    onChange={() => toggleId(item.id)}
                    type="checkbox"
                    value={item.id}
                  />
                ) : null}
              </span>
              <Link
                aria-label={`查看投稿：${item.title}`}
                className="group col-start-2 flex min-w-0 items-start gap-3 rounded-control sm:gap-4"
                href={`/dashboard/submissions/${item.id}`}
                prefetch={false}
              >
                <span className="relative block w-28 shrink-0 sm:w-44">
                  <CoverPreview emptyLabel={item.reviewHint.label === "信息待获取" ? "待获取封面" : "暂无封面"} priority={index === 0} sizes="(max-width: 639px) 112px, 176px" src={item.coverUrl} title={item.title} />
                  {item.duration && item.coverUrl ? <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] tabular-nums text-white">{item.duration}</span> : null}
                </span>
                <span className="block min-w-0 py-0.5">
                  <span className="line-clamp-2 break-words text-sm font-medium leading-6 text-foreground group-hover:underline group-hover:underline-offset-4 sm:text-base" title={item.title}>{item.title}</span>
                  <span className="mt-2 block truncate text-xs text-muted">{item.author ? `作者：${item.author}` : item.platformLabel === "原创上传" ? "原创视频" : "作者信息待获取"}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                    <span className="rounded border border-borderStrong px-1.5 py-0.5 text-[11px]">{item.platformLabel}</span>
                    <span>{item.createdAt} 提交</span>
                  </span>
                </span>
              </Link>
              <div className="col-start-2 flex items-center justify-between gap-3 lg:contents">
                <div className="min-w-0 space-y-2">
                  <StatusBadge status={item.status} />
                  {item.status === "pending" ? (
                    <div>
                      <p className={`text-xs ${item.reviewHint.needsAttention ? "text-amber-300" : "text-muted"}`}>{item.reviewHint.label}</p>
                      <p className="mt-1 hidden text-xs leading-5 text-subtle sm:block">{item.reviewHint.description}</p>
                    </div>
                  ) : null}
                </div>
                <Link
                  aria-label={`${item.status === "pending" ? "审核" : "查看"}投稿：${item.title}`}
                  className={item.status === "pending" ? "admin-button gap-2 px-3" : "admin-secondary-button gap-2 px-3"}
                  href={`/dashboard/submissions/${item.id}`}
                  prefetch={false}
                >
                  {item.status === "pending" ? "开始审核" : "查看详情"}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-16 text-center">
            <p className="text-base font-medium text-foreground">{status === "pending" ? "待审核队列已清空" : status === "approved" ? "暂无已通过投稿" : status === "rejected" ? "暂无已拒绝投稿" : "暂无投稿"}</p>
            <p className="mt-2 text-sm text-subtle">{status === "pending" ? "新的投稿会出现在这里，也可以切换状态查看已处理内容。" : "用户投稿及审核记录会显示在对应的列表中。"}</p>
          </div>
        )}
      </section>

      {selectedCount > 0 ? (
        <>
          <div aria-hidden="true" className="h-80 md:h-72" />
          <div className="admin-fade-in-up fixed inset-x-0 bottom-0 z-40 border-t border-borderStrong bg-background/95 backdrop-blur">
            <div className="mx-auto flex max-h-[50dvh] max-w-6xl flex-col gap-3 overflow-y-auto px-4 py-4 md:max-h-[70dvh]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p aria-live="polite" className="text-sm font-medium text-foreground">已选 {selectedCount} 条待审核投稿</p>
                  <p className="mt-1 text-xs text-subtle">请逐条核对内容；所选投稿将使用相同分类、标签和视频色板。</p>
                </div>
                <button
                  className="text-xs text-subtle underline-offset-4 transition hover:text-foreground hover:underline"
                  onClick={() => setSelectedIds(new Set())}
                  type="button"
                >
                  清除选择
                </button>
              </div>

              {!options ? (
                <div aria-live="polite" className="flex items-center gap-3 text-sm text-muted">
                  <span>{optionsError || "正在加载分类和标签…"}</span>
                  {optionsError ? (
                    <button className="admin-secondary-button" onClick={() => setOptionsAttempt((attempt) => attempt + 1)} type="button">
                      重试
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                <label className="block space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-subtle">
                    分类（批量通过必选）
                  </span>
                  <select className="admin-input" disabled={!options} name="categoryId" required>
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
                    审核备注（通过与拒绝共用）
                  </span>
                  <input className="admin-input" name="reviewNote" placeholder="填写审核意见或拒绝原因" type="text" />
                </label>

                <div className="flex gap-2">
                  <PendingButton className="admin-button" disabled={!options || categories.length === 0} pendingText="批量通过中…">
                    通过 {selectedCount} 条
                  </PendingButton>
                  <PendingButton
                    className="admin-secondary-button h-10"
                    formAction={batchRejectSubmissions}
                    formNoValidate
                    pendingText="批量拒绝中…"
                  >
                    拒绝 {selectedCount} 条
                  </PendingButton>
                </div>
              </div>

              <ReviewPaletteEditor onChange={setPalette} palette={palette} />
              <details className="admin-card">
                <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-[0.16em] text-subtle transition hover:text-foreground">
                  标签（可选，应用到全部选中项）
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


                </div>
              </details>
            </div>
          </div>
        </>
      ) : null}
    </form>
  );
}

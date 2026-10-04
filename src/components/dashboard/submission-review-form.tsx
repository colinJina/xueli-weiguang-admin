"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { approveSubmission } from "@/app/dashboard/actions";
import { createPvdexDictionaryItem, refreshPvdexSuggestions } from "@/app/dashboard/pvdex-actions";
import { PendingButton } from "@/components/dashboard/pending-button";
import { PvdexSuggestionPanel } from "@/components/dashboard/pvdex-suggestion-panel";
import { ReviewPaletteEditor } from "@/components/dashboard/review-palette-editor";
import type { PvdexSuggestionResult } from "@/lib/pvdex/types";
import { appendReviewSelections, MAX_REVIEW_TAGS, supplementReviewPalette, toggleReviewSelection, type ReviewSelection } from "@/lib/review/pvdex-form-state";
import type { DictionaryItem } from "@/lib/review/types";

export type PvdexReviewServices = {
  loadSuggestions: (id: string, signal: AbortSignal) => Promise<PvdexSuggestionResult>;
  refreshSuggestions: typeof refreshPvdexSuggestions;
  createItem: typeof createPvdexDictionaryItem;
};

const defaultServices: PvdexReviewServices = {
  async loadSuggestions(id, signal) {
    const response = await fetch(`/api/admin/submissions/${encodeURIComponent(id)}/pvdex`, { cache: "no-store", signal });
    if (!response.headers.get("content-type")?.includes("application/json")) { throw new Error("建议加载失败，请重试或重新登录。"); }
    const data = await response.json();
    if (!response.ok) { throw new Error(typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "建议加载失败，请重试。"); }
    return data as PvdexSuggestionResult;
  },
  refreshSuggestions: refreshPvdexSuggestions,
  createItem: createPvdexDictionaryItem,
};

type Props = {
  submissionId: string;
  canApprove: boolean;
  isPending: boolean;
  isExternal: boolean;
  disabledMessage: string;
  dictionaries: { categories: DictionaryItem[]; tags: DictionaryItem[] };
  services?: PvdexReviewServices;
};

export function SubmissionReviewForm({ submissionId, canApprove, isPending, isExternal, disabledMessage, dictionaries, services = defaultServices }: Props) {
  const [selection, setSelection] = useState<ReviewSelection>({ categoryId: "", tagIds: [], palette: [] });
  const [reviewNote, setReviewNote] = useState("");
  const [result, setResult] = useState<PvdexSuggestionResult | null>(null);
  const [loading, setLoading] = useState(isPending && isExternal);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [addedCategories, setAddedCategories] = useState<DictionaryItem[]>([]);
  const [addedTags, setAddedTags] = useState<DictionaryItem[]>([]);
  const [createdTags, setCreatedTags] = useState<Record<string, DictionaryItem>>({});
  const busy = useRef(false);
  const categories = mergeOptions(dictionaries.categories, addedCategories);
  const tags = mergeOptions(dictionaries.tags, addedTags);
  const editable = isPending && !creating;
  const showSuggestions = isPending && isExternal;
  const acceptResult = useCallback((data: PvdexSuggestionResult) => {
    if (data.status === "matched") {
      setAddedCategories((current) => mergeOptions(current, data.categories));
      setAddedTags((current) => mergeOptions(current, data.tags.flatMap((candidate) => candidate.item ? [candidate.item] : [])));
    }
    // Suggestions stay separate until explicitly adopted, preserving manual edits.
    setResult(data);
  }, []);

  useEffect(() => {
    if (!showSuggestions) { return; }
    const controller = new AbortController();
    setLoading(true);
    async function load() {
      try {
        const data = await services.loadSuggestions(submissionId, controller.signal);
        if (!controller.signal.aborted) { acceptResult(data); }
      } catch (error) {
        if (!controller.signal.aborted) { setResult(unavailable(error)); }
      } finally {
        if (!controller.signal.aborted) { setLoading(false); }
      }
    }
    void load();
    return () => controller.abort();
  }, [acceptResult, services, showSuggestions, submissionId]);

  async function refresh() {
    if (busy.current || loading) { return; }
    busy.current = true;
    setLoading(true);
    try { acceptResult(await services.refreshSuggestions(submissionId)); }
    catch (error) { setResult(unavailable(error)); }
    finally { setLoading(false); busy.current = false; }
  }

  function apply(additions: ReviewSelection) {
    const merged = appendReviewSelections(selection, additions);
    if (!merged.ok) { setMessage(merged.error); return; }
    setSelection(merged.value);
    setMessage("建议已加入表单，请检查后通过审核。");
  }

  function adoptPalette() {
    if (result?.status !== "matched") { return; }
    const palette = supplementReviewPalette(selection.palette, result.colors);
    const count = palette.length - selection.palette.length;
    setSelection((current) => ({ ...current, palette }));
    setMessage(`已补充 ${count} 个颜色，请检查视频色板。`);
  }

  async function createTag(source: string, name: string) {
    if (busy.current || !isPending) { return false; }
    if (selection.tagIds.length >= MAX_REVIEW_TAGS) { setMessage("标签已满，请先取消一个标签。"); return false; }
    busy.current = true;
    setCreating(true);
    setMessage("");
    try {
      const response = await services.createItem({ submissionId, kind: "tags", name });
      if (!response.ok) { setMessage(response.error); return false; }
      const merged = appendReviewSelections(selection, { categoryId: "", tagIds: [response.item.id], palette: [] });
      setAddedTags((current) => mergeOptions(current, [response.item]));
      setCreatedTags((current) => ({ ...current, [source]: response.item }));
      if (!merged.ok) { setMessage(merged.error); return false; }
      setSelection(merged.value);
      setMessage(response.reused ? "已选中现有标签。" : "标签已创建并选中。检查后通过审核即可发布。");
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败，请重试。"); return false; }
    finally { setCreating(false); busy.current = false; }
  }

  const displayedResult = result?.status === "matched" ? {
    ...result,
    tags: result.tags.map((candidate) => createdTags[candidate.name] ? { ...candidate, item: createdTags[candidate.name], ambiguous: false } : candidate),
  } : result;

  return (
    <form action={approveSubmission} className="admin-card space-y-4 p-4">
      <input name="submissionId" type="hidden" value={submissionId} />
      <ReviewFields>
        <div className="border-b border-border pb-3"><h2 className="text-lg font-semibold">{isPending ? "审核与发布" : "发布设置"}</h2><p className="mt-1 text-xs leading-5 text-subtle">{isPending ? "确认内容合适后，选择分类并通过审核。" : "此投稿已完成审核。"}</p></div>
        {showSuggestions ? <details className="space-y-3">
          <summary className="cursor-pointer rounded-control border border-border bg-panel px-3 py-3 text-sm text-muted">辅助审核建议（PVDex）<span aria-live="polite" className="mt-1 block pl-4 text-xs text-subtle">{loading ? "正在匹配，其他审核选项可先编辑" : displayedResult?.status === "matched" ? "已匹配，展开查看分类、标签和色板建议" : "展开查看匹配结果"}</span></summary>
          <PvdexSuggestionPanel result={displayedResult} loading={loading} creating={creating} tagCount={selection.tagIds.length} palette={selection.palette} onRefresh={() => void refresh()} onApply={apply} onAdoptPalette={adoptPalette} onCreateTag={createTag} />
        </details> : null}
        {message ? <p aria-live="polite" className="border border-border bg-panel p-3 text-sm text-muted" role="status">{message}</p> : null}
        <label className="block space-y-2"><span className="text-xs uppercase tracking-[0.16em] text-subtle">分类</span><select className="admin-input" disabled={!editable} name="categoryId" onChange={(event) => setSelection((current) => ({ ...current, categoryId: event.target.value }))} required value={selection.categoryId}><option value="">选择分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <ReviewPaletteEditor disabled={!editable} onChange={(palette) => setSelection((current) => ({ ...current, palette }))} palette={selection.palette} />
        <details className="rounded-control border border-border">
          <summary className="cursor-pointer px-3 py-3 text-sm text-muted">标签（可选）<span className="mt-1 block pl-4 text-xs text-subtle">已选 {selection.tagIds.length} 个标签</span></summary>
          <fieldset className="space-y-2 border-t border-border p-3" disabled={!editable}>
            <legend className="sr-only">标签，最多 4 个</legend>
            <div className="grid gap-2 sm:grid-cols-2">{tags.length ? tags.map((item) => {
              const checked = selection.tagIds.includes(item.id);
              const disabled = !checked && selection.tagIds.length >= MAX_REVIEW_TAGS;
              return <label className={`flex items-center gap-2 border border-border bg-panel px-3 py-2 ${disabled ? "opacity-40" : ""}`} key={item.id}><input checked={checked} className="h-4 w-4 accent-foreground" disabled={disabled} name="tagIds" onChange={() => setSelection((current) => ({ ...current, tagIds: toggleReviewSelection(current.tagIds, item.id, MAX_REVIEW_TAGS) }))} type="checkbox" value={item.id} /><span className="text-sm text-muted">{item.name}</span></label>;
            }) : <p className="text-sm text-muted">暂无标签。</p>}</div>
          </fieldset>
        </details>
        <label className="block space-y-2"><span className="text-xs uppercase tracking-[0.16em] text-subtle">审核备注</span><textarea className="admin-input h-auto min-h-24 py-2" disabled={!isPending} name="reviewNote" onChange={(event) => setReviewNote(event.target.value)} placeholder="填写本次审核意见（可选）" value={reviewNote} /></label>
        <PendingButton className="admin-button w-full" disabled={!canApprove || creating} pendingText="发布中…">通过审核</PendingButton>
        {!canApprove ? <p className="text-xs text-subtle">{disabledMessage}</p> : null}
      </ReviewFields>
    </form>
  );
}

function ReviewFields({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset aria-busy={pending} className="min-w-0 space-y-4" disabled={pending}>{children}</fieldset>;
}

function unavailable(error: unknown): PvdexSuggestionResult {
  return { status: "unavailable", message: error instanceof Error ? error.message : "PVDex 暂不可用，请重试。" };
}

function mergeOptions(initial: DictionaryItem[], additions: DictionaryItem[]) {
  const byId = new Map(initial.map((item) => [item.id, item]));
  for (const item of additions) { if (!byId.has(item.id)) { byId.set(item.id, item); } }
  return [...byId.values()];
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { approveSubmission } from "@/app/dashboard/actions";
import { createPvdexDictionaryItem, refreshPvdexSuggestions } from "@/app/dashboard/pvdex-actions";
import { PendingButton } from "@/components/dashboard/pending-button";
import { PvdexSuggestionPanel } from "@/components/dashboard/pvdex-suggestion-panel";
import type { PvdexSuggestionResult } from "@/lib/pvdex/types";
import { appendReviewSelections, MAX_REVIEW_TAGS, MAX_REVIEW_TONES, toggleReviewSelection, type ReviewSelection } from "@/lib/review/pvdex-form-state";
import type { DictionaryItem, ToneFamilyItem } from "@/lib/review/types";

export type PvdexReviewServices = {
  loadSuggestions: (id: string, signal: AbortSignal) => Promise<PvdexSuggestionResult>;
  refreshSuggestions: typeof refreshPvdexSuggestions;
  createItem: typeof createPvdexDictionaryItem;
};

const defaultServices: PvdexReviewServices = {
  async loadSuggestions(id, signal) {
    const response = await fetch(`/api/admin/submissions/${encodeURIComponent(id)}/pvdex`, { cache: "no-store", signal });
    if (!response.headers.get("content-type")?.includes("application/json")) {throw new Error("建议加载失败，请重试或重新登录。");}
    const data = await response.json();
    if (!response.ok) {throw new Error(typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "建议加载失败，请重试。");}
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
  dictionaries: { categories: DictionaryItem[]; tags: DictionaryItem[]; tones: DictionaryItem[]; toneFamilies: ToneFamilyItem[] };
  services?: PvdexReviewServices;
};

export function SubmissionReviewForm({ submissionId, canApprove, isPending, isExternal, disabledMessage, dictionaries, services = defaultServices }: Props) {
  const [selection, setSelection] = useState<ReviewSelection>({ categoryId: "", tagIds: [], toneIds: [] });
  const [reviewNote, setReviewNote] = useState("");
  const [result, setResult] = useState<PvdexSuggestionResult | null>(null);
  const [loading, setLoading] = useState(isPending && isExternal);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [addedCategories, setAddedCategories] = useState<DictionaryItem[]>([]);
  const [addedTags, setAddedTags] = useState<DictionaryItem[]>([]);
  const [addedTones, setAddedTones] = useState<DictionaryItem[]>([]);
  const [createdTags, setCreatedTags] = useState<Record<string, DictionaryItem>>({});
  const [createdTones, setCreatedTones] = useState<Record<string, DictionaryItem>>({});
  const busy = useRef(false);
  const categories = mergeOptions(dictionaries.categories, addedCategories);
  const tags = mergeOptions(dictionaries.tags, addedTags);
  const tones = mergeOptions(dictionaries.tones, addedTones).map((tone) => ({ ...tone, family_name: dictionaries.toneFamilies.find((family) => family.id === tone.family_id)?.name ?? tone.family_name }));
  const editable = isPending && !creating;
  const showSuggestions = isPending && isExternal;
  const acceptResult = useCallback((data: PvdexSuggestionResult) => {
    if (data.status === "matched") {
      // Refresh may discover dictionary rows another administrator just created.
      // Keep these options even if a later source request fails or no longer matches.
      setAddedCategories((current) => mergeOptions(current, data.categories));
      setAddedTags((current) => mergeOptions(current, data.tags.flatMap((candidate) => candidate.item ? [candidate.item] : [])));
      setAddedTones((current) => mergeOptions(current, data.colors.flatMap((candidate) => candidate.item ? [candidate.item] : [])));
    }
    setResult(data);
  }, []);

  useEffect(() => {
    if (!showSuggestions) {return;}
    const controller = new AbortController();
    setLoading(true);
    async function load() {
      try {
        const data = await services.loadSuggestions(submissionId, controller.signal);
        if (!controller.signal.aborted) {acceptResult(data);}
      } catch (error) {
        if (!controller.signal.aborted) {setResult(unavailable(error));}
      } finally {
        if (!controller.signal.aborted) {setLoading(false);}
      }
    }
    void load();
    return () => controller.abort();
  }, [acceptResult, services, showSuggestions, submissionId]);

  async function refresh() {
    if (busy.current || loading) {return;}
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

  async function createItem(kind: "tags" | "tones", source: string, name: string, familyId?: string) {
    if (busy.current || !isPending) {return false;}
    if ((kind === "tags" ? selection.tagIds.length >= MAX_REVIEW_TAGS : selection.toneIds.length >= MAX_REVIEW_TONES)) {
      setMessage(kind === "tags" ? "标签已满，请先取消一个标签。" : "色调已满，请先取消一个色调。");
      return false;
    }
    busy.current = true;
    setCreating(true);
    setMessage("");
    try {
      const response = await services.createItem({ submissionId, kind, name, ...(kind === "tones" ? { colorHex: source, familyId } : {}) });
      if (!response.ok) { setMessage(response.error); return false; }
      const merged = appendReviewSelections(selection, { categoryId: "", tagIds: kind === "tags" ? [response.item.id] : [], toneIds: kind === "tones" ? [response.item.id] : [] });
      if (kind === "tags") {
        setAddedTags((current) => mergeOptions(current, [response.item]));
        setCreatedTags((current) => ({ ...current, [source]: response.item }));
      } else {
        setAddedTones((current) => mergeOptions(current, [response.item]));
        setCreatedTones((current) => ({ ...current, [source]: response.item }));
      }
      if (!merged.ok) { setMessage(merged.error); return false; }
      setSelection(merged.value);
      setMessage(response.reused ? "已选中现有词条。" : "词条已创建并选中。检查后通过审核即可发布。");
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败，请重试。"); return false; }
    finally { setCreating(false); busy.current = false; }
  }

  const displayedResult = result?.status === "matched" ? {
    ...result,
    tags: result.tags.map((candidate) => createdTags[candidate.name] ? { ...candidate, item: createdTags[candidate.name], ambiguous: false } : candidate),
    colors: result.colors.map((candidate) => createdTones[candidate.hex] ? { ...candidate, item: createdTones[candidate.hex], ambiguous: false } : candidate),
  } : result;

  return (
    <form action={approveSubmission} className="admin-card space-y-4 p-4">
      <input name="submissionId" type="hidden" value={submissionId} />
      <ReviewFields>
      <div className="border-b border-border pb-3"><p className="text-xs uppercase tracking-[0.18em] text-subtle">通过</p><h2 className="mt-2 text-lg font-semibold">发布到档案</h2></div>
      {showSuggestions ? <PvdexSuggestionPanel result={displayedResult} loading={loading} creating={creating} tagCount={selection.tagIds.length} toneCount={selection.toneIds.length} families={dictionaries.toneFamilies} onRefresh={() => void refresh()} onApply={apply} onCreateTag={(source, name) => createItem("tags", source, name)} onCreateTone={(hex, name, familyId) => createItem("tones", hex, name, familyId)} /> : null}
      {message ? <p aria-live="polite" className="border border-border bg-panel p-3 text-sm text-muted" role="status">{message}</p> : null}
      <label className="block space-y-2"><span className="text-xs uppercase tracking-[0.16em] text-subtle">分类</span><select className="admin-input" disabled={!editable} name="categoryId" onChange={(event) => setSelection((current) => ({ ...current, categoryId: event.target.value }))} required value={selection.categoryId}><option value="">选择分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <fieldset className="space-y-2" disabled={!editable}>
        <legend className="text-xs uppercase tracking-[0.16em] text-subtle">标签，最多 4 个 · 已选 {selection.tagIds.length}</legend>
        <div className="grid gap-2 sm:grid-cols-2">{tags.length ? tags.map((item) => {
          const checked = selection.tagIds.includes(item.id);
          const disabled = !checked && selection.tagIds.length >= MAX_REVIEW_TAGS;
          return <label className={`flex items-center gap-2 border border-border bg-panel px-3 py-2 ${disabled ? "opacity-40" : ""}`} key={item.id}><input checked={checked} className="h-4 w-4 accent-foreground" disabled={disabled} name="tagIds" onChange={() => setSelection((current) => ({ ...current, tagIds: toggleReviewSelection(current.tagIds, item.id, MAX_REVIEW_TAGS) }))} type="checkbox" value={item.id} /><span className="text-sm text-muted">{item.name}</span></label>;
        }) : <p className="text-sm text-muted">暂无标签。</p>}</div>
      </fieldset>
      <fieldset className="space-y-2" disabled={!editable}>
        <legend className="text-xs uppercase tracking-[0.16em] text-subtle">色调，最多 3 个 · 已选 {selection.toneIds.length}</legend>
        <div className="grid grid-cols-3 gap-2">{tones.length ? tones.map((item) => {
          const checked = selection.toneIds.includes(item.id);
          const disabled = !checked && selection.toneIds.length >= MAX_REVIEW_TONES;
          return <label className={`flex flex-col items-center gap-2 border border-border bg-panel px-2 py-3 ${disabled ? "opacity-40" : "cursor-pointer"}`} key={item.id}><input aria-label={`色调：${item.name}`} checked={checked} className="peer sr-only" disabled={disabled} name="toneIds" onChange={() => setSelection((current) => ({ ...current, toneIds: toggleReviewSelection(current.toneIds, item.id, MAX_REVIEW_TONES) }))} type="checkbox" value={item.id} /><span aria-hidden="true" className="h-9 w-9 rounded-full border border-borderStrong peer-checked:shadow-[0_0_0_3px_rgba(255,255,255,0.3)]" style={{ backgroundColor: validColor(item.color_hex ?? item.name) }} /><span className="max-w-full break-all text-center text-xs text-muted peer-checked:text-foreground">{item.name}</span>{item.family_name ? <span className="text-xs text-subtle">{item.family_name}</span> : null}</label>;
        }) : <p className="text-sm text-muted">暂无色调。</p>}</div>
      </fieldset>
      <label className="block space-y-2"><span className="text-xs uppercase tracking-[0.16em] text-subtle">审核备注</span><textarea className="admin-input h-auto min-h-24 py-2" disabled={!isPending} name="reviewNote" onChange={(event) => setReviewNote(event.target.value)} value={reviewNote} /></label>
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
  for (const item of additions) {if (!byId.has(item.id)) {byId.set(item.id, item);}}
  return [...byId.values()];
}

function validColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#D4D4D4";
}

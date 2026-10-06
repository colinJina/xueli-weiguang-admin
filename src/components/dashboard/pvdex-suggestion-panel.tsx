"use client";

import { useState } from "react";

import type { PvdexSuggestionResult } from "@/lib/pvdex/types";
import { MAX_REVIEW_COLORS, type ReviewPaletteColor } from "@/lib/review/palette";
import { MAX_REVIEW_TAGS, supplementReviewPalette, type ReviewSelection } from "@/lib/review/pvdex-form-state";
import type { DictionaryItem } from "@/lib/review/types";

type MatchedSuggestion = Extract<PvdexSuggestionResult, { status: "matched" }>;

type Props = {
  result: PvdexSuggestionResult | null;
  loading: boolean;
  creating: boolean;
  tagCount: number;
  palette: ReviewPaletteColor[];
  onRefresh: () => void;
  onApply: (selection: ReviewSelection) => void;
  onAdoptPalette: () => void;
  onCreateTag: (sourceName: string, name: string) => Promise<boolean>;
};

export function PvdexSuggestionPanel(props: Props) {
  const { result, loading, creating, onRefresh } = props;
  return (
    <section aria-label="PVDex 审核建议" aria-busy={loading} className="space-y-3 border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-medium">PVDex 审核建议</h3><p className="mt-1 text-xs text-subtle">采用建议时保留当前分类、标签和色板。</p></div>
        <button className="admin-secondary-button shrink-0 text-xs" disabled={loading || creating} onClick={onRefresh} type="button">{loading ? "获取中…" : "刷新建议"}</button>
      </div>
      {loading ? <p aria-live="polite" className="text-sm text-muted">正在匹配视频，其他审核选项仍可编辑…</p> : null}
      {!loading && result?.status !== "matched" ? <div className="space-y-2 text-sm text-muted" role="status">
        <p>{result?.message ?? "等待匹配结果。"}</p>
        {result?.status === "ambiguous" && result.matches?.length ? <ul className="space-y-1">{result.matches.map((match) => <li key={match.id}><a className="underline underline-offset-4" href={match.url} rel="noreferrer" target="_blank">{match.title}</a></li>)}</ul> : null}
        <p className="text-xs text-subtle">可继续使用下方选项人工审核。</p>
      </div> : null}
      {result?.status === "matched" && !loading ? <MatchedCandidates key={`${result.match.id}:${result.fetchedAt}`} {...props} result={result} /> : null}
    </section>
  );
}

function MatchedCandidates({ result, creating, tagCount, palette, onApply, onAdoptPalette, onCreateTag }: Omit<Props, "result"> & { result: MatchedSuggestion }) {
  const [categoryId, setCategoryId] = useState(result.categoryId ?? "");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [colorHexes, setColorHexes] = useState<string[]>([]);
  const colors = [...result.colors].sort((a, b) => b.percentage - a.percentage || a.order - b.order);
  const supplementCount = supplementReviewPalette(palette, colors).length - palette.length;
  return (
    <div className="space-y-3">
      <div className="space-y-1 border-t border-border pt-3 text-xs text-subtle">
        <a className="block truncate text-muted underline underline-offset-4" href={result.match.url} rel="noreferrer" target="_blank">{result.match.title}</a>
        <p>{result.match.method === "primary" ? "视频 ID 精确匹配" : "备用链接精确匹配"} · 获取时间 {new Date(result.fetchedAt).toLocaleString("zh-CN")}</p>
        {result.analysisStatus === "failed" ? <p>来源分析失败，请人工核实已有候选。</p> : null}
      </div>
      {result.categories.length ? <label className="block space-y-1 text-xs text-muted">
        <span>建议分类（只补充空白分类）</span>
        <select className="admin-input" disabled={creating} onChange={(event) => setCategoryId(event.target.value)} value={categoryId}><option value="">{result.categories.length > 1 ? "多个分类命中，请选择" : "暂不采用分类"}</option>{result.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label> : <p className="text-xs text-subtle">未找到对应分类，请在下方手动选择。</p>}
      <details open>
        <summary className="cursor-pointer text-xs text-muted">标签候选 · {result.tags.length} 个</summary>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">{result.tags.length ? result.tags.map((candidate) => <div className="border border-border bg-background p-2" key={candidate.name}>
          {candidate.item ? <CandidateCheckbox checked={tagIds.includes(candidate.item.id)} disabled={creating} item={candidate.item} onToggle={() => setTagIds((current) => toggle(current, candidate.item!.id))} /> : candidate.ambiguous ? <p className="text-xs text-muted">{candidate.name} · 同名词条不唯一，请在下方手动选择。</p> : <NewTag name={candidate.name} disabled={creating || tagCount >= MAX_REVIEW_TAGS} onCreate={onCreateTag} />}
        </div>) : <p className="text-xs text-subtle">来源未提供标签。</p>}</div>
      </details>
      <details open>
        <summary className="cursor-pointer text-xs text-muted">色板候选 · {colors.length} 个（按占比排序）</summary>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">{colors.length ? colors.map((candidate) => {
          const alreadySelected = palette.some((color) => color.hex === candidate.hex);
          return <label className="flex items-center gap-2 border border-border bg-background p-2 text-xs text-muted" key={candidate.hex}>
            <input aria-label={`建议颜色：${candidate.hex}`} checked={alreadySelected || colorHexes.includes(candidate.hex)} className="h-4 w-4 accent-foreground" disabled={creating || alreadySelected || (!colorHexes.includes(candidate.hex) && palette.length + colorHexes.filter((hex) => !palette.some((color) => color.hex === hex)).length >= MAX_REVIEW_COLORS)} onChange={() => setColorHexes((current) => toggle(current, candidate.hex))} type="checkbox" />
            <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-borderStrong" style={{ backgroundColor: candidate.hex }} /><span className="font-mono">{candidate.hex}</span><span>{(candidate.percentage * 100).toFixed(1)}%</span>{alreadySelected ? <span className="ml-auto text-subtle">已在色板</span> : null}
          </label>;
        }) : <p className="text-xs text-subtle">来源未提供有效色板。</p>}</div>
        <button className="admin-secondary-button mt-2 w-full" disabled={creating || !supplementCount} onClick={onAdoptPalette} type="button">采用前 5 色 · {palette.length >= MAX_REVIEW_COLORS ? "色板已满" : supplementCount ? `补充 ${supplementCount} 色` : "没有可补充颜色"}</button>
      </details>
      <button className="admin-secondary-button w-full" disabled={creating || (!categoryId && !tagIds.length && !colorHexes.length)} onClick={() => onApply({ categoryId, tagIds, palette: colors.filter((color) => colorHexes.includes(color.hex)).map(({ hex, percentage }) => ({ hex, percentage })) })} type="button">采用勾选的建议</button>
      <p className="text-xs text-subtle">最多 {MAX_REVIEW_TAGS} 个标签、{MAX_REVIEW_COLORS} 色。点击“创建并选中”即可添加新标签。</p>
    </div>
  );
}

function CandidateCheckbox({ checked, disabled, item, onToggle }: { checked: boolean; disabled: boolean; item: DictionaryItem; onToggle: () => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-xs text-muted"><input aria-label={`建议：${item.name}`} checked={checked} className="h-4 w-4 accent-foreground" disabled={disabled} onChange={onToggle} type="checkbox" /><span>{item.name}</span><span className="ml-auto text-subtle">已存在</span></label>;
}

function NewTag({ name, disabled, onCreate }: { name: string; disabled: boolean; onCreate: Props["onCreateTag"] }) {
  return <div className="flex items-center justify-between gap-2 text-xs">
    <span className="break-all text-muted">{name}</span>
    <button className="shrink-0 text-subtle underline underline-offset-4 disabled:opacity-40" disabled={disabled || !name.trim()} onClick={() => void onCreate(name, name)} type="button">创建并选中</button>
  </div>;
}

function toggle(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

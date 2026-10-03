"use client";

import { useState } from "react";

import type { PvdexSuggestionResult } from "@/lib/pvdex/types";
import type { DictionaryItem, ToneFamilyItem } from "@/lib/review/types";
import type { ReviewSelection } from "@/lib/review/pvdex-form-state";

type MatchedSuggestion = Extract<PvdexSuggestionResult, { status: "matched" }>;

type Props = {
  result: PvdexSuggestionResult | null;
  loading: boolean;
  creating: boolean;
  tagCount: number;
  toneCount: number;
  families: ToneFamilyItem[];
  onRefresh: () => void;
  onApply: (selection: ReviewSelection) => void;
  onCreateTag: (sourceName: string, name: string) => Promise<boolean>;
  onCreateTone: (hex: string, name: string, familyId: string) => Promise<boolean>;
};

export function PvdexSuggestionPanel(props: Props) {
  const { result, loading, creating, onRefresh } = props;
  return (
    <section aria-label="PVDex 审核建议" aria-busy={loading} className="space-y-3 border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">PVDex 审核建议</h3>
          <p className="mt-1 text-xs text-subtle">勾选后采用，保留你当前的选择。</p>
        </div>
        <button className="admin-secondary-button shrink-0 text-xs" disabled={loading || creating} onClick={onRefresh} type="button">
          {loading ? "获取中…" : "刷新建议"}
        </button>
      </div>
      {loading ? <p aria-live="polite" className="text-sm text-muted">正在匹配视频，其他审核选项仍可编辑…</p> : null}
      {!loading && result?.status !== "matched" ? (
        <div className="space-y-2 text-sm text-muted" role="status">
          <p>{result?.message ?? "等待匹配结果。"}</p>
          {result?.status === "ambiguous" && result.matches?.length ? (
            <ul className="space-y-1">
              {result.matches.map((match) => <li key={match.id}><a className="underline underline-offset-4" href={match.url} rel="noreferrer" target="_blank">{match.title}</a></li>)}
            </ul>
          ) : null}
          <p className="text-xs text-subtle">可继续使用下方选项人工审核。</p>
        </div>
      ) : null}
      {result?.status === "matched" && !loading ? (
        <MatchedCandidates key={`${result.match.id}:${result.fetchedAt}`} {...props} result={result} />
      ) : null}
    </section>
  );
}

function MatchedCandidates({ result, creating, tagCount, toneCount, families, onApply, onCreateTag, onCreateTone }: Omit<Props, "result"> & { result: MatchedSuggestion }) {
  const [categoryId, setCategoryId] = useState(result.categoryId ?? "");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [toneIds, setToneIds] = useState<string[]>([]);
  const enabledFamilies = families.filter((family) => family.is_active);
  return (
    <div className="space-y-3">
      <div className="space-y-1 border-t border-border pt-3 text-xs text-subtle">
        <a className="block truncate text-muted underline underline-offset-4" href={result.match.url} rel="noreferrer" target="_blank">{result.match.title}</a>
        <p>{result.match.method === "primary" ? "视频 ID 精确匹配" : "备用链接精确匹配"} · 获取时间 {new Date(result.fetchedAt).toLocaleString("zh-CN")}</p>
        {result.analysisStatus === "failed" ? <p>来源分析失败，请人工核实已有候选。</p> : null}
      </div>
      {result.categories.length ? (
        <label className="block space-y-1 text-xs text-muted">
          <span>建议分类（只补充空白分类）</span>
          <select className="admin-input" disabled={creating} onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
            <option value="">{result.categories.length > 1 ? "多个分类命中，请选择" : "暂不采用分类"}</option>
            {result.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : <p className="text-xs text-subtle">未找到对应分类，请在下方手动选择。</p>}
      <details open>
        <summary className="cursor-pointer text-xs text-muted">标签候选 · {result.tags.length} 个</summary>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {result.tags.length ? result.tags.map((candidate) => (
            <div className="border border-border bg-background p-2" key={candidate.name}>
              {candidate.item ? <CandidateCheckbox checked={tagIds.includes(candidate.item.id)} disabled={creating} item={candidate.item} onToggle={() => setTagIds((current) => toggle(current, candidate.item!.id))} /> : candidate.ambiguous ? (
                <p className="text-xs text-muted">{candidate.name} · 同名词条不唯一，请在下方手动选择。</p>
              ) : <NewTag name={candidate.name} disabled={creating || tagCount >= 4} onCreate={onCreateTag} />}
            </div>
          )) : <p className="text-xs text-subtle">来源未提供标签。</p>}
        </div>
      </details>
      <details open>
        <summary className="cursor-pointer text-xs text-muted">色板候选 · {result.colors.length} 个</summary>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
          {result.colors.length ? result.colors.map((candidate) => (
            <div className="space-y-2 border border-border bg-background p-2" key={candidate.hex}>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-borderStrong" style={{ backgroundColor: candidate.hex }} />
                <span className="font-mono">{candidate.hex}</span><span>{(candidate.percentage * 100).toFixed(1)}%</span>
              </div>
              {candidate.item ? <CandidateCheckbox checked={toneIds.includes(candidate.item.id)} disabled={creating} item={candidate.item} onToggle={() => setToneIds((current) => toggle(current, candidate.item!.id))} /> : candidate.ambiguous ? (
                <p className="text-xs text-subtle">同色词条不唯一，请在下方手动选择。</p>
              ) : <NewTone hex={candidate.hex} families={enabledFamilies} disabled={creating || toneCount >= 3} onCreate={onCreateTone} />}
            </div>
          )) : <p className="text-xs text-subtle">来源未提供有效色板。</p>}
        </div>
      </details>
      <button className="admin-secondary-button w-full" disabled={creating || (!categoryId && !tagIds.length && !toneIds.length)} onClick={() => onApply({ categoryId, tagIds, toneIds })} type="button">采用勾选的建议</button>
      <p className="text-xs text-subtle">最多 4 个标签、3 个色调。新建词条前请确认名称与色族。</p>
    </div>
  );
}

function CandidateCheckbox({ checked, disabled, item, onToggle }: { checked: boolean; disabled: boolean; item: DictionaryItem; onToggle: () => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-xs text-muted"><input aria-label={`建议：${item.name}`} checked={checked} className="h-4 w-4 accent-foreground" disabled={disabled} onChange={onToggle} type="checkbox" /><span>{item.name}</span><span className="ml-auto text-subtle">已存在</span></label>;
}

function NewTag({ name, disabled, onCreate }: { name: string; disabled: boolean; onCreate: Props["onCreateTag"] }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(name);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs"><span className="break-all text-muted">{name}</span><button className="shrink-0 text-subtle underline underline-offset-4 disabled:opacity-40" disabled={disabled} onClick={() => setOpen((current) => !current)} type="button">{open ? "取消" : "创建并选中"}</button></div>
      {open ? <div className="space-y-2 border-t border-border pt-2"><input aria-label={`新标签名称：${name}`} className="admin-input" disabled={disabled} maxLength={40} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") {event.preventDefault();} }} value={newName} /><p className="text-xs text-subtle">确认后加入词库，并选中当前投稿。</p><button className="admin-secondary-button w-full text-xs" disabled={disabled || !newName.trim()} onClick={async () => { if (await onCreate(name, newName)) {setOpen(false);} }} type="button">确认创建标签</button></div> : null}
    </div>
  );
}

function NewTone({ hex, families, disabled, onCreate }: { hex: string; families: ToneFamilyItem[]; disabled: boolean; onCreate: Props["onCreateTone"] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(hex);
  const [familyId, setFamilyId] = useState("");
  return (
    <div className="space-y-2">
      <button className="text-xs text-subtle underline underline-offset-4 disabled:opacity-40" disabled={disabled || !families.length} onClick={() => setOpen((current) => !current)} type="button">{open ? "取消创建" : "创建色调并选中"}</button>
      {!families.length ? <p className="text-xs text-subtle">暂无启用的色族，请先维护色族。</p> : null}
      {open ? <div className="space-y-2 border-t border-border pt-2"><input aria-label={`色调名称：${hex}`} className="admin-input" disabled={disabled} maxLength={40} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") {event.preventDefault();} }} value={name} /><select aria-label={`所属色族：${hex}`} className="admin-input" disabled={disabled} onChange={(event) => setFamilyId(event.target.value)} value={familyId}><option value="">选择所属色族</option>{families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select><p className="text-xs text-subtle">确认后加入词库，并选中当前投稿。</p><button className="admin-secondary-button w-full text-xs" disabled={disabled || !name.trim() || !familyId} onClick={async () => { if (await onCreate(hex, name, familyId)) {setOpen(false);} }} type="button">确认创建色调</button></div> : null}
    </div>
  );
}

function toggle(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

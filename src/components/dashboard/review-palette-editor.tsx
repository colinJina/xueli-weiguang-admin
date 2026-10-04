"use client";

import { useEffect, useRef, useState } from "react";

import { normalizePvdexHex } from "@/lib/pvdex/matching";
import { MAX_REVIEW_COLORS, type ReviewPaletteColor } from "@/lib/review/palette";
import { replaceReviewPaletteColor } from "@/lib/review/pvdex-form-state";

type Props = {
  palette: ReviewPaletteColor[];
  onChange: (palette: ReviewPaletteColor[]) => void;
  disabled?: boolean;
};

export function ReviewPaletteEditor({ palette, onChange, disabled = false }: Props) {
  const [newHex, setNewHex] = useState("#D4D4D4");
  const [message, setMessage] = useState("");

  function replace(index: number, value: string) {
    const result = replaceReviewPaletteColor(palette, index, value);
    setMessage(result.ok ? "" : result.error);
    if (result.ok) { onChange(result.value); }
    return result.ok;
  }

  function add() {
    const hex = normalizePvdexHex(newHex);
    if (!hex) { setMessage("请输入完整的 6 位 HEX 颜色。"); return; }
    if (palette.some((color) => color.hex === hex)) { setMessage("色板中已经有这个颜色。"); return; }
    if (palette.length >= MAX_REVIEW_COLORS) { return; }
    onChange([...palette, { hex, percentage: null }]);
    setMessage("");
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-xs uppercase tracking-[0.16em] text-subtle">视频色板，最多 {MAX_REVIEW_COLORS} 色 · 已选 {palette.length}</legend>
      <input name="palette" type="hidden" value={JSON.stringify(palette)} />
      <p className="text-xs leading-5 text-subtle">直接选色或输入 HEX。替换建议颜色后，占比会清空。</p>
      {palette.length ? <div className="space-y-2">{palette.map((color, index) => (
        <PaletteColorRow color={color} index={index} key={index} onRemove={() => { onChange(palette.filter((_, position) => position !== index)); setMessage(""); }} onReplace={(hex) => replace(index, hex)} />
      ))}</div> : <p className="text-sm text-muted">暂未添加颜色。</p>}
      {palette.length < MAX_REVIEW_COLORS ? <div className="flex flex-wrap items-center gap-2">
        <input aria-label="新颜色选择器" className="h-10 w-12 cursor-pointer border border-borderStrong bg-background p-1" onChange={(event) => setNewHex(event.target.value.toUpperCase())} type="color" value={normalizePvdexHex(newHex) ?? "#D4D4D4"} />
        <input aria-label="新颜色 HEX" autoCapitalize="characters" className="admin-input w-32 font-mono uppercase" maxLength={7} onChange={(event) => setNewHex(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="#D4D4D4" value={newHex} />
        <button className="admin-secondary-button" onClick={add} type="button">添加颜色</button>
      </div> : <p className="text-xs text-subtle">色板已满，可替换或删除现有颜色。</p>}
      {message ? <p aria-live="polite" className="text-xs text-muted" role="status">{message}</p> : null}
    </fieldset>
  );
}

function PaletteColorRow({ color, index, onRemove, onReplace }: {
  color: ReviewPaletteColor; index: number; onRemove: () => void; onReplace: (hex: string) => boolean;
}) {
  const [draft, setDraft] = useState(color.hex);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(color.hex); input.current?.setCustomValidity(""); }, [color.hex]);
  function commit(input: HTMLInputElement) {
    const accepted = onReplace(draft);
    input.setCustomValidity(accepted ? "" : "请输入有效且不重复的 HEX 颜色。");
    if (accepted) { setDraft(normalizePvdexHex(draft)!); }
    return accepted;
  }
  return <div className="flex flex-wrap items-center gap-2 border border-border bg-panel p-2">
    <input aria-label={`颜色 ${index + 1} 选择器`} className="h-10 w-12 cursor-pointer border border-borderStrong bg-background p-1" onChange={(event) => onReplace(event.target.value)} type="color" value={color.hex} />
    <input aria-label={`颜色 ${index + 1} HEX`} autoCapitalize="characters" className="admin-input w-32 font-mono uppercase" maxLength={7} onBlur={(event) => commit(event.currentTarget)} onChange={(event) => { setDraft(event.target.value); event.target.setCustomValidity(""); }} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); if (!commit(event.currentTarget)) { event.currentTarget.reportValidity(); } }
    }} pattern="#?[0-9A-Fa-f]{6}" ref={input} required value={draft} />
    <span className="text-xs text-subtle">{color.percentage === null ? "手动颜色" : `占比 ${(color.percentage * 100).toFixed(1)}%`}</span>
    <button aria-label={`删除颜色 ${index + 1}`} className="ml-auto text-xs text-subtle underline underline-offset-4" onClick={onRemove} type="button">删除</button>
  </div>;
}

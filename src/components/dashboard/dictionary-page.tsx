import Link from "next/link";

import {
  addDictionaryItem, deleteDictionaryItem, updateDictionaryItem, updateToneFamilyItem, updateToneItem,
} from "@/app/dashboard/actions";
import { AdminForm, ConfirmDeleteButton } from "@/components/dashboard/admin-form";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Notice } from "@/components/dashboard/notice";
import { PendingButton } from "@/components/dashboard/pending-button";
import { buildMenuHref, matchesSearch } from "@/lib/review/menu-navigation";
import type { DictionaryItem, ToneFamilyItem } from "@/lib/review/types";

type DictionaryKind = "categories" | "tags";
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
type Messages = { error?: string; notice?: string; query: string };

export function DictionaryPage({ description, error, items, kind, notice, title, query }: Messages & {
  description: string; items: DictionaryItem[]; kind: DictionaryKind; title: string;
}) {
  const path = `/dashboard/${kind}`;
  const returnPath = buildMenuHref(path, { q: query });
  const visible = items.filter((item) => matchesSearch(query, item.name));
  const isCategory = kind === "categories";
  const columns = isCategory ? "grid-cols-[minmax(180px,1fr)_100px_260px]" : "grid-cols-[minmax(180px,1fr)_260px]";
  const deleteAction = deleteDictionaryItem.bind(null, kind);
  return (
    <div className="space-y-5">
      <PageHeading title={title} description={description} />
      <Notice error={error} notice={notice} />
      <AdminForm action={addDictionaryItem.bind(null, kind)} className="admin-card flex flex-wrap gap-2 p-4" key={items.length} label={`添加${title}`}>
        <ReturnPath value={returnPath} />
        <input aria-label={`新${title}名称`} className="admin-input sm:w-64" maxLength={40} name="name" placeholder={`新${title}名称`} required />
        {isCategory ? <input aria-label="新分类排序" className="admin-input sm:w-28" defaultValue={0} name="sortOrder" step={1} type="number" /> : null}
        <PendingButton pendingText="添加中…">添加</PendingButton>
      </AdminForm>
      <ListFilters key={returnPath} path={path} query={query} summary={`显示 ${visible.length} / ${items.length} 个${title}`} />
      <section className="admin-card overflow-x-auto">
        <div className="min-w-[580px]">
          <div className={`grid ${columns} gap-2 border-b border-border bg-panel px-4 py-3 text-xs text-subtle`}>
            <span>名称</span>{isCategory ? <span>排序（小值优先）</span> : null}<span>操作</span>
          </div>
          {visible.length ? visible.map((item) => (
            <AdminForm action={updateDictionaryItem.bind(null, kind)} className={`grid ${columns} items-center gap-2 border-b border-border px-4 py-3 last:border-b-0`} key={JSON.stringify(item)} label={`编辑${item.name}`}>
              <ReturnPath value={returnPath} /><input name="id" type="hidden" value={item.id} />
              <input aria-label={`${item.name}名称`} className="admin-input" defaultValue={item.name} maxLength={40} name="name" required />
              {isCategory ? <input aria-label={`${item.name}排序`} className="admin-input" defaultValue={item.sort_order ?? 0} name="sortOrder" step={1} type="number" /> : null}
              <div className="flex flex-wrap items-start gap-2">
                <PendingButton className="admin-secondary-button" pendingText="保存中…">保存</PendingButton>
                <ConfirmDeleteButton action={deleteAction} label={item.name} />
              </div>
            </AdminForm>
          )) : <EmptyDictionary filtered={Boolean(query)} />}
        </div>
      </section>
    </div>
  );
}

export function ToneFamiliesPage({ error, families, notice, query, active }: Messages & { families: ToneFamilyItem[]; active: string }) {
  const path = "/dashboard/tone-families";
  const returnPath = buildMenuHref(path, { q: query, active: active === "all" ? undefined : active });
  const visible = families.filter((family) => matchesSearch(query, family.name, family.key) && (active === "all" || family.is_active === (active === "enabled")));
  const deleteAction = deleteDictionaryItem.bind(null, "tone_families");
  const columns = "grid-cols-[72px_minmax(160px,1fr)_140px_80px_88px_260px]";
  return (
    <div className="space-y-5">
      <PageHeading title="色族" description="色族用于前台色调筛选。禁用后不在前台筛选项中展示，已绑定的色调仍保留。" />
      <Notice error={error} notice={notice} />
      <AdminForm action={addDictionaryItem.bind(null, "tone_families")} className="admin-card grid gap-2 p-4 xl:grid-cols-[1fr_1fr_88px_184px_80px]" key={families.length} label="添加色族">
        <ReturnPath value={returnPath} />
        <input aria-label="新色族名称" className="admin-input" maxLength={20} name="name" placeholder="名称，例如 蓝" required />
        <input aria-label="新色族 Key" className="admin-input font-mono" name="key" pattern="[a-z][a-z0-9_]*" placeholder="Key，例如 blue" required />
        <input aria-label="新色族排序" className="admin-input" defaultValue={0} name="sortOrder" step={1} type="number" />
        <ColorInputs defaultColor="#737373" />
        <PendingButton pendingText="添加中…">添加</PendingButton>
      </AdminForm>
      <ListFilters filters={[{ name: "active", label: "启用状态", value: active, options: [{ value: "all", label: "全部状态" }, { value: "enabled", label: "已启用" }, { value: "disabled", label: "已禁用" }] }]} key={returnPath} path={path} placeholder="搜索色族名称或 Key" query={query} summary={`显示 ${visible.length} / ${families.length} 个色族`} />
      <section className="admin-card overflow-x-auto">
        <div className="min-w-[880px]">
          <div className={`grid ${columns} gap-2 border-b border-border bg-panel px-4 py-3 text-xs text-subtle`}>
            <span>代表色</span><span>名称</span><span>Key</span><span>排序</span><span>启用</span><span>操作</span>
          </div>
          {visible.length ? visible.map((family) => (
            <AdminForm action={updateToneFamilyItem} className={`grid ${columns} items-center gap-2 border-b border-border px-4 py-3 last:border-b-0`} key={JSON.stringify(family)} label={`编辑${family.name}色族`}>
              <ReturnPath value={returnPath} /><input name="id" type="hidden" value={family.id} />
              <input aria-label={`${family.name}代表色`} className="h-9 w-12 cursor-pointer border border-borderStrong bg-background p-1" defaultValue={family.color_hex} name="colorHex" type="color" />
              <input aria-label={`${family.name}名称`} className="admin-input" defaultValue={family.name} maxLength={20} name="name" required />
              <input aria-label={`${family.name} Key`} className="admin-input font-mono" defaultValue={family.key} name="key" pattern="[a-z][a-z0-9_]*" required />
              <input aria-label={`${family.name}排序`} className="admin-input" defaultValue={family.sort_order} name="sortOrder" step={1} type="number" />
              <label className="flex items-center gap-2 text-sm text-muted"><input className="h-4 w-4 accent-foreground" defaultChecked={family.is_active} name="isActive" type="checkbox" />启用</label>
              <div className="flex flex-wrap items-start gap-2">
                <PendingButton className="admin-secondary-button" pendingText="保存中…">保存</PendingButton>
                <ConfirmDeleteButton action={deleteAction} label={family.name} />
              </div>
            </AdminForm>
          )) : <EmptyDictionary filtered={Boolean(query) || active !== "all"} />}
        </div>
      </section>
    </div>
  );
}

export function TonesPage({ error, families, items, notice, query, familyId }: Messages & { families: ToneFamilyItem[]; items: DictionaryItem[]; familyId: string }) {
  const path = "/dashboard/tones";
  const returnPath = buildMenuHref(path, { q: query, family: familyId });
  const visible = items.filter((item) => matchesSearch(query, item.name, item.color_hex, item.family_name) && (!familyId || (familyId === "unassigned" ? !item.family_id : item.family_id === familyId)));
  const deleteAction = deleteDictionaryItem.bind(null, "tones");
  const columns = "grid-cols-[56px_minmax(160px,1fr)_128px_minmax(140px,1fr)_260px]";
  return (
    <div className="space-y-5">
      <PageHeading title="色调" description="具体色调用于审核绑定和卡片展示；每个色调必须归属一个色族。" />
      <Notice error={error} notice={notice} />
      {!families.length ? <p className="admin-alert">添加色调前，请先<Link className="underline" href="/dashboard/tone-families">创建色族</Link>。</p> : null}
      <AdminForm action={addDictionaryItem.bind(null, "tones")} className="admin-card grid gap-2 p-4 xl:grid-cols-[1fr_1fr_184px_80px]" key={items.length} label="添加色调">
        <ReturnPath value={returnPath} />
        <input aria-label="新色调名称" className="admin-input" maxLength={40} name="name" placeholder="名称，例如 雾蓝" required />
        <FamilySelect families={families} label="新色调归属色族" />
        <ColorInputs defaultColor="#D4D4D4" />
        <PendingButton disabled={!families.length} pendingText="添加中…">添加</PendingButton>
      </AdminForm>
      <ListFilters filters={[{ name: "family", label: "归属色族", value: familyId, options: [{ value: "", label: "全部色族" }, { value: "unassigned", label: "未归属色族" }, ...families.map((family) => ({ value: family.id, label: family.name }))] }]} key={returnPath} path={path} placeholder="搜索色调名称、HEX 或色族" query={query} summary={`显示 ${visible.length} / ${items.length} 个色调`} />
      <section className="admin-card overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={`grid ${columns} gap-2 border-b border-border bg-panel px-4 py-3 text-xs text-subtle`}>
            <span>颜色</span><span>名称</span><span>HEX</span><span>色族</span><span>操作</span>
          </div>
          {visible.length ? visible.map((item) => (
            <AdminForm action={updateToneItem} className={`grid ${columns} items-center gap-2 border-b border-border px-4 py-3 last:border-b-0`} key={JSON.stringify(item)} label={`编辑${item.name}色调`}>
              <ReturnPath value={returnPath} /><input name="id" type="hidden" value={item.id} />
              <span aria-hidden="true" className="h-8 w-8 rounded-full border border-borderStrong" style={{ backgroundColor: getToneColor(item) }} />
              <input aria-label={`${item.name}名称`} className="admin-input" defaultValue={item.name} maxLength={40} name="name" required />
              <input aria-label={`${item.name} HEX`} className="admin-input font-mono uppercase" defaultValue={getToneColor(item)} maxLength={7} name="manualColorHex" pattern="#?[0-9A-Fa-f]{6}" required />
              <FamilySelect families={families} label={`${item.name}归属色族`} selectedId={item.family_id ?? undefined} />
              <div className="flex flex-wrap items-start gap-2">
                <PendingButton className="admin-secondary-button" pendingText="保存中…">保存</PendingButton>
                <ConfirmDeleteButton action={deleteAction} label={item.name} />
              </div>
            </AdminForm>
          )) : <EmptyDictionary filtered={Boolean(query || familyId)} />}
        </div>
      </section>
    </div>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="border-b border-border pb-4"><p className="text-xs uppercase tracking-[0.22em] text-subtle">字典</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted">{description}</p></div>;
}
function EmptyDictionary({ filtered }: { filtered: boolean }) {
  return <div className="px-4 py-10 text-sm text-muted">{filtered ? "没有符合筛选条件的条目，请调整关键词或重置筛选。" : "暂无条目，可使用上方表单添加。"}</div>;
}
function ReturnPath({ value }: { value: string }) { return <input name="returnPath" type="hidden" value={value} />; }
function ColorInputs({ defaultColor }: { defaultColor: string }) {
  return <span className="flex gap-2"><input aria-label="颜色板" className="h-10 w-12 shrink-0 cursor-pointer border border-borderStrong bg-background p-1" defaultValue={defaultColor} name="colorHex" type="color" /><input aria-label="手动 HEX 颜色" autoCapitalize="characters" className="admin-input w-32 font-mono uppercase" maxLength={7} name="manualColorHex" pattern="#?[0-9A-Fa-f]{6}" placeholder="#D93A32" /></span>;
}
function FamilySelect({ families, selectedId, label }: { families: ToneFamilyItem[]; selectedId?: string; label: string }) {
  return <select aria-label={label} className="admin-input" defaultValue={selectedId ?? ""} name="familyId" required><option value="">选择色族</option>{families.map((family) => <option key={family.id} value={family.id}>{family.name}{family.is_active ? "" : "（已禁用）"}</option>)}</select>;
}
function getToneColor(item: DictionaryItem) {
  const color = item.color_hex ?? item.name;
  return HEX_COLOR_PATTERN.test(color) ? color : "#D4D4D4";
}

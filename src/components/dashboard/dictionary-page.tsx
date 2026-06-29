import {
  addDictionaryItem,
  deleteDictionaryItem,
  updateToneFamilyItem,
  updateToneItem,
} from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import type { DictionaryItem, ToneFamilyItem } from "@/lib/review/types";

type DictionaryKind = "categories" | "tags";
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type DictionaryPageProps = {
  description: string;
  error?: string;
  items: DictionaryItem[];
  kind: DictionaryKind;
  notice?: string;
  title: string;
};

export function DictionaryPage({
  description,
  error,
  items,
  kind,
  notice,
  title,
}: DictionaryPageProps) {
  const addAction = addDictionaryItem.bind(null, kind);
  const deleteAction = deleteDictionaryItem.bind(null, kind);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">字典</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-2 text-sm text-muted">{description}</p>
        </div>
        <form action={addAction} className="flex min-w-0 items-center gap-2">
          <input className="admin-input w-56" name="name" placeholder="名称" />
          <button className="admin-button" type="submit">
            添加
          </button>
        </form>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div
          className="grid grid-cols-[1fr_120px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle"
        >
          <span>名称</span>
          <span>操作</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <div
              className="grid grid-cols-[1fr_120px] items-center border-b border-border px-4 py-3 last:border-b-0"
              key={item.id}
            >
              <span className="text-sm text-foreground">{item.name}</span>
              <form action={deleteAction}>
                <input name="id" type="hidden" value={item.id} />
                <button className="admin-secondary-button" type="submit">
                  删除
                </button>
              </form>
            </div>
          ))
        ) : (
          <div className="px-4 py-10 text-sm text-muted">暂无条目。</div>
        )}
      </section>
    </div>
  );
}

type ToneFamiliesPageProps = {
  error?: string;
  families: ToneFamilyItem[];
  notice?: string;
};

export function ToneFamiliesPage({ error, families, notice }: ToneFamiliesPageProps) {
  const addAction = addDictionaryItem.bind(null, "tone_families");
  const deleteAction = deleteDictionaryItem.bind(null, "tone_families");

  return (
    <div className="space-y-5">
      <div className="border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-subtle">字典</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">色族</h1>
        <p className="mt-2 text-sm text-muted">前台 Archive 色调筛选使用色族，具体色调归入色族后参与近似匹配。</p>
      </div>

      <Notice error={error} notice={notice} />

      <form action={addAction} className="grid gap-2 border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_88px_120px_80px]">
        <input className="admin-input" name="name" placeholder="名称，例如 蓝" />
        <input className="admin-input font-mono" name="key" placeholder="key，例如 blue" />
        <input className="admin-input" name="sortOrder" placeholder="排序" type="number" />
        <ColorInputs defaultColor="#737373" />
        <button className="admin-button" type="submit">
          添加
        </button>
      </form>

      <section className="overflow-hidden border border-border bg-surface">
        <div className="grid grid-cols-[72px_1fr_1fr_80px_88px_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle">
          <span>颜色</span>
          <span>名称</span>
          <span>Key</span>
          <span>排序</span>
          <span>启用</span>
          <span>操作</span>
        </div>
        {families.length ? (
          families.map((family) => (
            <form
              action={updateToneFamilyItem}
              className="grid grid-cols-[72px_1fr_1fr_80px_88px_160px] items-center gap-2 border-b border-border px-4 py-3 last:border-b-0"
              key={family.id}
            >
              <input name="id" type="hidden" value={family.id} />
              <input
                aria-label={`${family.name}代表色`}
                className="h-9 w-12 cursor-pointer border border-borderStrong bg-background p-1 outline-none transition focus:border-foreground"
                defaultValue={family.color_hex}
                name="colorHex"
                type="color"
              />
              <input className="admin-input" name="name" defaultValue={family.name} />
              <input className="admin-input font-mono" name="key" defaultValue={family.key} />
              <input className="admin-input" name="sortOrder" defaultValue={family.sort_order} type="number" />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input className="h-4 w-4 accent-white" defaultChecked={family.is_active} name="isActive" type="checkbox" />
                启用
              </label>
              <div className="flex gap-2">
                <button className="admin-secondary-button" type="submit">
                  保存
                </button>
                <button className="admin-secondary-button" form={`delete-family-${family.id}`} type="submit">
                  删除
                </button>
              </div>
            </form>
          ))
        ) : (
          <div className="px-4 py-10 text-sm text-muted">暂无条目。</div>
        )}
      </section>

      {families.map((family) => (
        <form action={deleteAction} id={`delete-family-${family.id}`} key={family.id}>
          <input name="id" type="hidden" value={family.id} />
        </form>
      ))}
    </div>
  );
}

type TonesPageProps = {
  error?: string;
  families: ToneFamilyItem[];
  items: DictionaryItem[];
  notice?: string;
};

export function TonesPage({ error, families, items, notice }: TonesPageProps) {
  const addAction = addDictionaryItem.bind(null, "tones");
  const deleteAction = deleteDictionaryItem.bind(null, "tones");

  return (
    <div className="space-y-5">
      <div className="border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-subtle">字典</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">色调</h1>
        <p className="mt-2 text-sm text-muted">具体色调用于审核绑定和卡片圆点展示；每个色调必须归属一个色族。</p>
      </div>

      <Notice error={error} notice={notice} />

      <form action={addAction} className="grid gap-2 border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_120px_80px]">
        <input className="admin-input" name="name" placeholder="名称，例如 雾蓝" />
        <FamilySelect families={families} />
        <ColorInputs defaultColor="#D4D4D4" />
        <button className="admin-button" type="submit">
          添加
        </button>
      </form>

      <section className="overflow-hidden border border-border bg-surface">
        <div className="grid grid-cols-[72px_1fr_1fr_1fr_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle">
          <span>颜色</span>
          <span>名称</span>
          <span>HEX</span>
          <span>色族</span>
          <span>操作</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <form
              action={updateToneItem}
              className="grid grid-cols-[72px_1fr_1fr_1fr_160px] items-center gap-2 border-b border-border px-4 py-3 last:border-b-0"
              key={item.id}
            >
              <input name="id" type="hidden" value={item.id} />
              <span
                aria-hidden="true"
                className="h-8 w-8 rounded-full border border-borderStrong shadow-[0_0_0_4px_rgba(255,255,255,0.04)]"
                style={{ backgroundColor: getToneColor(item) }}
              />
              <input className="admin-input" name="name" defaultValue={item.name} />
              <input className="admin-input font-mono uppercase" name="manualColorHex" defaultValue={getToneColor(item)} />
              <FamilySelect families={families} selectedId={item.family_id ?? undefined} />
              <div className="flex gap-2">
                <button className="admin-secondary-button" type="submit">
                  保存
                </button>
                <button className="admin-secondary-button" form={`delete-tone-${item.id}`} type="submit">
                  删除
                </button>
              </div>
            </form>
          ))
        ) : (
          <div className="px-4 py-10 text-sm text-muted">暂无条目。</div>
        )}
      </section>

      {items.map((item) => (
        <form action={deleteAction} id={`delete-tone-${item.id}`} key={item.id}>
          <input name="id" type="hidden" value={item.id} />
        </form>
      ))}
    </div>
  );
}

function ColorInputs({ defaultColor }: { defaultColor: string }) {
  return (
    <span className="flex gap-2">
      <input
        aria-label="颜色板"
        className="h-10 w-14 cursor-pointer border border-borderStrong bg-background p-1 outline-none transition focus:border-foreground"
        defaultValue={defaultColor}
        name="colorHex"
        type="color"
      />
      <input
        aria-label="手动 HEX 颜色"
        autoCapitalize="characters"
        className="admin-input w-28 font-mono uppercase"
        inputMode="text"
        maxLength={7}
        name="manualColorHex"
        pattern="#?[0-9A-Fa-f]{6}"
        placeholder="#D93A32"
      />
    </span>
  );
}

function FamilySelect({
  families,
  selectedId,
}: {
  families: ToneFamilyItem[];
  selectedId?: string;
}) {
  return (
    <select className="admin-input" defaultValue={selectedId ?? ""} name="familyId" required>
      <option value="">选择色族</option>
      {families.map((family) => (
        <option key={family.id} value={family.id}>
          {family.name}
        </option>
      ))}
    </select>
  );
}

function getToneColor(item: DictionaryItem) {
  const color = item.color_hex ?? item.name;
  return HEX_COLOR_PATTERN.test(color) ? color : "#D4D4D4";
}

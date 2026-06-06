import { addDictionaryItem, deleteDictionaryItem } from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import type { DictionaryItem } from "@/lib/review/types";

type DictionaryKind = "categories" | "tags" | "tones";
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
  const isTonePage = kind === "tones";

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">字典</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-2 text-sm text-muted">{description}</p>
        </div>
        <form action={addAction} className="flex min-w-0 items-center gap-2">
          {isTonePage ? (
            <input
              aria-label="语气颜色"
              className="h-10 w-14 cursor-pointer border border-borderStrong bg-background p-1 outline-none transition focus:border-foreground"
              defaultValue="#D4D4D4"
              name="colorHex"
              type="color"
            />
          ) : (
            <input className="admin-input w-56" name="name" placeholder="名称" />
          )}
          <button className="admin-button" type="submit">
            添加
          </button>
        </form>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div
          className={`grid border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle ${
            isTonePage ? "grid-cols-[88px_1fr_120px]" : "grid-cols-[1fr_120px]"
          }`}
        >
          {isTonePage ? <span>颜色</span> : null}
          <span>{isTonePage ? "语气" : "名称"}</span>
          <span>操作</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <div
              className={`grid items-center border-b border-border px-4 py-3 last:border-b-0 ${
                isTonePage ? "grid-cols-[88px_1fr_120px]" : "grid-cols-[1fr_120px]"
              }`}
              key={item.id}
            >
              {isTonePage ? (
                <span
                  aria-hidden="true"
                  className="h-8 w-8 rounded-full border border-borderStrong shadow-[0_0_0_4px_rgba(255,255,255,0.04)]"
                  style={{ backgroundColor: getToneColor(item) }}
                />
              ) : null}
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

function getToneColor(item: DictionaryItem) {
  const color = item.color_hex ?? item.name;
  return HEX_COLOR_PATTERN.test(color) ? color : "#D4D4D4";
}

import { addDictionaryItem, deleteDictionaryItem } from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import type { DictionaryItem } from "@/lib/review/types";

type DictionaryKind = "categories" | "tags" | "tones";

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
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Dictionary</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-2 text-sm text-muted">{description}</p>
        </div>
        <form action={addAction} className="flex min-w-0 gap-2">
          <input className="admin-input w-56" name="name" placeholder="Name" />
          <button className="admin-button" type="submit">
            Add
          </button>
        </form>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div className="grid grid-cols-[1fr_120px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle">
          <span>Name</span>
          <span>Action</span>
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
                  Delete
                </button>
              </form>
            </div>
          ))
        ) : (
          <div className="px-4 py-10 text-sm text-muted">No items yet.</div>
        )}
      </section>
    </div>
  );
}

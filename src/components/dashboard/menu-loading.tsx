export function MenuLoading() {
  return (
    <div aria-busy="true" aria-label="正在加载菜单内容" className="space-y-5">
      <div className="space-y-3 border-b border-border pb-4"><div className="admin-skeleton h-3 w-16" /><div className="admin-skeleton h-8 w-44" /></div>
      <div className="admin-card flex gap-2 p-4"><div className="admin-skeleton h-10 w-64" /><div className="admin-skeleton h-10 w-24" /></div>
      <section className="admin-card overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => <div className="flex justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0" key={index}><div className="admin-skeleton h-10 w-1/2" /><div className="admin-skeleton h-10 w-28" /></div>)}
      </section>
    </div>
  );
}

export default function VideosLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <div className="admin-skeleton h-3 w-16" />
          <div className="admin-skeleton h-8 w-44" />
        </div>
        <div className="admin-skeleton h-7 w-24" />
      </div>

      <section className="overflow-hidden border border-border bg-surface">
        <div className="border-b border-border bg-panel px-4 py-3">
          <div className="admin-skeleton h-3 w-full max-w-md" />
        </div>
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[1.2fr_150px_140px_220px] lg:items-center"
            key={index}
          >
            <div className="space-y-2">
              <div className="admin-skeleton h-4 w-3/4" />
              <div className="admin-skeleton h-3 w-1/3" />
            </div>
            <div className="admin-skeleton h-4 w-24" />
            <div className="admin-skeleton h-4 w-20" />
            <div className="admin-skeleton h-9 w-full max-w-52" />
          </div>
        ))}
      </section>
    </div>
  );
}

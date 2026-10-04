export default function SubmissionsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <div className="admin-skeleton h-3 w-16" />
          <div className="admin-skeleton h-8 w-44" />
        </div>
        <div className="admin-skeleton h-7 w-28" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="admin-skeleton h-8 w-20" key={index} />
        ))}
      </div>

      <section aria-label="正在加载投稿内容" aria-busy="true" className="overflow-hidden admin-card">
        <div className="border-b border-border bg-panel px-4 py-3">
          <div className="admin-skeleton h-3 w-full max-w-md" />
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="flex items-center gap-4 border-b border-border px-4 py-5 last:border-b-0"
            key={index}
          >
            <div className="admin-skeleton h-4 w-4 shrink-0" />
            <div className="admin-skeleton aspect-video w-28 shrink-0 sm:w-44" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="admin-skeleton h-4 w-3/4" />
              <div className="admin-skeleton h-3 w-1/2" />
            </div>
            <div className="admin-skeleton hidden h-10 w-24 lg:block" />
          </div>
        ))}
      </section>
    </div>
  );
}

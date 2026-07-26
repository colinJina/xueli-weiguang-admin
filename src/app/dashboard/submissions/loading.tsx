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

      <section className="overflow-hidden border border-border bg-surface">
        <div className="border-b border-border bg-panel px-4 py-3">
          <div className="admin-skeleton h-3 w-full max-w-md" />
        </div>
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[36px_1.2fr_1fr_130px_120px] md:items-center"
            key={index}
          >
            <div className="admin-skeleton hidden h-4 w-4 md:block" />
            <div className="space-y-2">
              <div className="admin-skeleton h-4 w-3/4" />
              <div className="admin-skeleton h-3 w-1/2" />
            </div>
            <div className="admin-skeleton h-4 w-32" />
            <div className="admin-skeleton h-4 w-16" />
            <div className="admin-skeleton h-6 w-16" />
          </div>
        ))}
      </section>
    </div>
  );
}

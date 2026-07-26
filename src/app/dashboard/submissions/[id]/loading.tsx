export default function SubmissionDetailLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0 space-y-3">
          <div className="admin-skeleton h-3 w-14" />
          <div className="admin-skeleton h-8 w-72 max-w-full" />
          <div className="admin-skeleton h-4 w-56 max-w-full" />
        </div>
        <div className="admin-skeleton h-7 w-20" />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 border border-border bg-surface p-4">
          <div className="space-y-3 border-b border-border pb-3">
            <div className="admin-skeleton h-3 w-16" />
            <div className="admin-skeleton h-6 w-40" />
          </div>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="admin-skeleton aspect-video w-full" />
            <div className="space-y-3">
              <div className="admin-skeleton h-5 w-3/4" />
              <div className="grid grid-cols-2 gap-3">
                <div className="admin-skeleton h-16" />
                <div className="admin-skeleton h-16" />
              </div>
              <div className="admin-skeleton h-4 w-full" />
              <div className="admin-skeleton h-4 w-2/3" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="space-y-4 border border-border bg-surface p-4" key={index}>
              <div className="space-y-3 border-b border-border pb-3">
                <div className="admin-skeleton h-3 w-12" />
                <div className="admin-skeleton h-6 w-32" />
              </div>
              <div className="admin-skeleton h-10 w-full" />
              <div className="admin-skeleton h-24 w-full" />
              <div className="admin-skeleton h-10 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

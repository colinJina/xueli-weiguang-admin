export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <div className="admin-skeleton h-3 w-16" />
          <div className="admin-skeleton h-8 w-52" />
        </div>
        <div className="admin-skeleton h-9 w-24" />
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="space-y-4 border border-border bg-surface p-4" key={index}>
            <div className="admin-skeleton h-3 w-24" />
            <div className="admin-skeleton h-9 w-16" />
            <div className="admin-skeleton h-4 w-36" />
          </div>
        ))}
      </section>
    </div>
  );
}

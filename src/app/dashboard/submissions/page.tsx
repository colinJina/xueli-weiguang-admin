export const metadata = {
  title: "Submissions",
};

export default function SubmissionsPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Submissions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Pending review queue</h1>
        </div>
        <div className="flex gap-2 text-xs uppercase tracking-[0.16em] text-subtle">
          <span className="border border-borderStrong px-2 py-1">No fetching</span>
          <span className="border border-borderStrong px-2 py-1">Placeholder</span>
        </div>
      </div>

      <section className="overflow-hidden border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_1fr_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle">
          <span>Source URL</span>
          <span>Submitted by</span>
          <span>Status</span>
        </div>
        <div className="px-4 py-12 text-center">
          <p className="text-base font-medium text-foreground">Submissions list will be connected in Task 4.</p>
          <p className="mt-2 text-sm text-muted">This task only establishes the protected shell and route structure.</p>
        </div>
      </section>
    </div>
  );
}

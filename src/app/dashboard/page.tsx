import Link from "next/link";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Review operations</h1>
        </div>
        <Link className="admin-secondary-button" href="/dashboard/submissions">
          Open submissions
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        {["Pending submissions", "Published videos", "Dictionary items"].map((label) => (
          <div className="border border-border bg-surface p-4" key={label}>
            <p className="text-xs uppercase tracking-[0.18em] text-subtle">{label}</p>
            <p className="mt-4 text-3xl font-semibold">--</p>
            <p className="mt-2 text-sm text-muted">Data fetching starts in the next task.</p>
          </div>
        ))}
      </section>
    </div>
  );
}

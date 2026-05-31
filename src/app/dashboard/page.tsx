import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import { listPublishedVideos, listSubmissions } from "@/lib/review/queries";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const [submissions, videos] = await Promise.all([
    listSubmissions(supabase),
    listPublishedVideos(supabase),
  ]);
  const pendingCount = submissions.filter((submission) => submission.status === "pending").length;

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
        <MetricCard label="Pending submissions" value={pendingCount} />
        <MetricCard label="Total submissions" value={submissions.length} />
        <MetricCard label="Published videos" value={videos.length} />
      </section>
    </div>
  );
}

function MetricCard({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-subtle">{label}</p>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-muted">Live Supabase data.</p>
    </div>
  );
}

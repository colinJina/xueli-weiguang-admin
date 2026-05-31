import Link from "next/link";

import { Notice } from "@/components/dashboard/notice";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
import { listSubmissions } from "@/lib/review/queries";

export const metadata = {
  title: "Submissions",
};

type SubmissionsPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function SubmissionsPage({ searchParams }: SubmissionsPageProps) {
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const submissions = await listSubmissions(supabase);
  const pendingCount = submissions.filter((submission) => submission.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Submissions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Pending review queue</h1>
        </div>
        <div className="flex gap-2 text-xs uppercase tracking-[0.16em] text-subtle">
          <span className="border border-borderStrong px-2 py-1">{pendingCount} Pending</span>
          <span className="border border-borderStrong px-2 py-1">{submissions.length} Total</span>
        </div>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[1.2fr_1fr_130px_120px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle md:grid">
          <span>Source URL</span>
          <span>Created</span>
          <span>Metadata</span>
          <span>Status</span>
        </div>
        {submissions.length ? (
          submissions.map((submission) => (
            <Link
              className="grid gap-2 border-b border-border px-4 py-3 text-sm transition last:border-b-0 hover:bg-panel md:grid-cols-[1.2fr_1fr_130px_120px] md:items-center"
              href={`/dashboard/submissions/${submission.id}`}
              key={submission.id}
            >
              <span className="min-w-0 truncate text-foreground">{submission.source_url}</span>
              <span className="text-muted">{new Date(submission.created_at).toLocaleString()}</span>
              <span className="text-muted">
                {submission.fetched_at ? "Fetched" : submission.fetch_error ? "Failed" : "Pending"}
              </span>
              <StatusBadge status={submission.status} />
            </Link>
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">No submissions yet.</p>
            <p className="mt-2 text-sm text-muted">Submitted Bilibili links will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}

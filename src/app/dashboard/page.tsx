import Link from "next/link";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/admin/auth";
import type { AdminContext } from "@/lib/admin/auth";
import { countPublishedVideos, countSubmissions } from "@/lib/review/queries";

export const metadata = {
  title: "控制台",
};

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">控制台</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">审核运营概览</h1>
        </div>
        <Link className="admin-secondary-button" href="/dashboard/submissions">
          查看投稿
        </Link>
      </div>

      <Suspense fallback={<MetricsLoading />}>
        <DashboardMetrics supabase={supabase} />
      </Suspense>
    </div>
  );
}

async function DashboardMetrics({ supabase }: Pick<AdminContext, "supabase">) {
  const [pendingCount, submissionCount, videoCount] = await Promise.all([
    countSubmissions(supabase, "pending"),
    countSubmissions(supabase),
    countPublishedVideos(supabase),
  ]);

  return (
    <section className="grid gap-3 md:grid-cols-3">
      <MetricCard label="待审核投稿" value={pendingCount} />
      <MetricCard label="投稿总数" value={submissionCount} />
      <MetricCard label="已发布视频" value={videoCount} />
    </section>
  );
}

function MetricsLoading() {
  return (
    <section aria-busy="true" aria-label="正在加载统计数据" className="grid gap-3 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="admin-card space-y-4 p-4" key={index}>
          <div className="admin-skeleton h-3 w-24" />
          <div className="admin-skeleton h-9 w-16" />
          <div className="admin-skeleton h-4 w-36" />
        </div>
      ))}
    </section>
  );
}

function MetricCard({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="admin-card p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-subtle">{label}</p>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-muted">来自 Supabase 的实时数据。</p>
    </div>
  );
}

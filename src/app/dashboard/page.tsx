import Link from "next/link";
import { Suspense } from "react";

import { loadAdminPageData } from "@/lib/admin/auth";
import { countPublishedVideos, countSubmissions } from "@/lib/review/queries";

export const metadata = {
  title: "控制台",
};

export default async function DashboardPage() {
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
        <DashboardMetrics />
      </Suspense>
      <section className="admin-card p-4">
        <h2 className="text-sm font-medium">常用操作</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="admin-secondary-button" href="/dashboard/home-hero">处理首页精选</Link>
          <Link className="admin-secondary-button" href="/dashboard/categories">维护分类</Link>
          <Link className="admin-secondary-button" href="/dashboard/tags">维护标签</Link>
          <Link className="admin-secondary-button" href="/dashboard/tones">维护色调</Link>
        </div>
      </section>
    </div>
  );
}

async function DashboardMetrics() {
  const [pendingCount, submissionCount, videoCount] = await loadAdminPageData((supabase) => Promise.all([
    countSubmissions(supabase, "pending"),
    countSubmissions(supabase),
    countPublishedVideos(supabase),
  ]));

  return (
    <section className="grid gap-3 md:grid-cols-3">
      <MetricCard href="/dashboard/submissions" label="待审核投稿" value={pendingCount} />
      <MetricCard href="/dashboard/submissions?status=all" label="投稿总数" value={submissionCount} />
      <MetricCard href="/dashboard/videos" label="已发布视频" value={videoCount} />
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

function MetricCard({ href, label, value }: Readonly<{ href: string; label: string; value: number }>) {
  return (
    <Link className="admin-card p-4 transition-colors hover:border-subtle" href={href}>
      <p className="text-xs uppercase tracking-[0.18em] text-subtle">{label}</p>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-muted">查看列表 →</p>
    </Link>
  );
}

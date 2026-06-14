import Link from "next/link";

import { Notice } from "@/components/dashboard/notice";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getSubmissionStorageProvider,
  isCosSubmission,
  listSubmissions,
} from "@/lib/review/queries";
import type { SubmissionRow } from "@/lib/review/types";

export const metadata = {
  title: "投稿",
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
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">投稿</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">待审核队列</h1>
        </div>
        <div className="flex gap-2 text-xs uppercase tracking-[0.16em] text-subtle">
          <span className="border border-borderStrong px-2 py-1">{pendingCount} 待审核</span>
          <span className="border border-borderStrong px-2 py-1">{submissions.length} 总数</span>
        </div>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[1.2fr_1fr_130px_120px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle md:grid">
          <span>来源</span>
          <span>提交时间</span>
          <span>元数据</span>
          <span>状态</span>
        </div>
        {submissions.length ? (
          submissions.map((submission) => (
            <Link
              className="grid gap-2 border-b border-border px-4 py-3 text-sm transition last:border-b-0 hover:bg-panel md:grid-cols-[1.2fr_1fr_130px_120px] md:items-center"
              href={`/dashboard/submissions/${submission.id}`}
              key={submission.id}
            >
              <span className="min-w-0">
                <span className="block truncate text-foreground">
                  {getSubmissionSourceLabel(submission)}
                </span>
                {getSubmissionSourceDetail(submission) ? (
                  <span className="mt-1 block truncate text-xs text-subtle">
                    {getSubmissionSourceDetail(submission)}
                  </span>
                ) : null}
              </span>
              <span className="text-muted">{new Date(submission.created_at).toLocaleString()}</span>
              <span className="text-muted">{getMetadataStatusLabel(submission)}</span>
              <StatusBadge status={submission.status} />
            </Link>
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">暂无投稿。</p>
            <p className="mt-2 text-sm text-muted">用户提交的外链和原创投稿会显示在这里。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function getSubmissionSourceLabel(submission: SubmissionRow) {
  if (isCosSubmission(submission)) {
    return "原创";
  }

  return submission.source_url ?? submission.external_id;
}

function getSubmissionSourceDetail(submission: SubmissionRow) {
  if (isCosSubmission(submission)) {
    return submission.source_ref ?? submission.external_id;
  }

  return `${getSubmissionPlatformLabel(submission)} / ${submission.external_id}`;
}

function getMetadataStatusLabel(submission: SubmissionRow) {
  if (isCosSubmission(submission)) {
    return "本地上传";
  }

  return submission.fetched_at ? "已获取" : submission.fetch_error ? "获取失败" : "待获取";
}

function getSubmissionPlatformLabel(submission: SubmissionRow) {
  const storageProvider = getSubmissionStorageProvider(submission);

  if (storageProvider === "youtube") {
    return "YouTube";
  }

  if (storageProvider === "bilibili") {
    return "Bilibili";
  }

  if (storageProvider === "cos") {
    return "COS 原创";
  }

  return "未知来源";
}

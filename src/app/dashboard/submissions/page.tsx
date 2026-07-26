import Link from "next/link";

import { Notice } from "@/components/dashboard/notice";
import { Pagination } from "@/components/dashboard/pagination";
import {
  SubmissionsBatchList,
  type SubmissionBatchListItem,
} from "@/components/dashboard/submissions-batch-list";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getSubmissionStorageProvider,
  isCosSubmission,
  listAllDictionaries,
  listSubmissionsPage,
} from "@/lib/review/queries";
import type { SubmissionListRow, SubmissionStatusFilter } from "@/lib/review/types";

export const metadata = {
  title: "投稿",
};

const PAGE_SIZE = 20;

const statusTabs: Array<{ label: string; value: SubmissionStatusFilter }> = [
  { label: "待审核", value: "pending" },
  { label: "已通过", value: "approved" },
  { label: "已拒绝", value: "rejected" },
  { label: "全部", value: "all" },
];

type SubmissionsPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    page?: string;
    status?: string;
  }>;
};

export default async function SubmissionsPage({ searchParams }: SubmissionsPageProps) {
  const [{ error, notice, page: pageParam, status: statusParam }, { supabase }] =
    await Promise.all([searchParams, requireAdmin()]);
  const status = coerceStatusFilter(statusParam);
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const [{ rows, total }, { categories, tags, tones }] = await Promise.all([
    listSubmissionsPage(supabase, { status, page, pageSize: PAGE_SIZE }),
    listAllDictionaries(supabase),
  ]);
  const items = rows.map(toBatchListItem);
  const activeTab = statusTabs.find((tab) => tab.value === status) ?? statusTabs[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">投稿</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">审核队列</h1>
        </div>
        <span className="border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.16em] text-subtle">
          {activeTab.label} {total} 条
        </span>
      </div>

      <Notice error={error} notice={notice} />

      <nav aria-label="状态筛选" className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const isActive = tab.value === status;

          return (
            <Link
              className={`border px-3 py-1.5 text-xs uppercase tracking-[0.16em] transition ${
                isActive
                  ? "border-borderStrong bg-panel text-foreground"
                  : "border-border text-subtle hover:border-borderStrong hover:text-foreground"
              }`}
              href={buildStatusHref(tab.value)}
              key={tab.value}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <SubmissionsBatchList categories={categories} items={items} tags={tags} tones={tones} />

      <Pagination
        basePath="/dashboard/submissions"
        page={page}
        pageSize={PAGE_SIZE}
        searchParams={{ status: status === "pending" ? undefined : status }}
        total={total}
      />
    </div>
  );
}

function coerceStatusFilter(value: string | undefined): SubmissionStatusFilter {
  if (value === "approved" || value === "rejected" || value === "all") {
    return value;
  }

  return "pending";
}

function buildStatusHref(status: SubmissionStatusFilter) {
  return status === "pending" ? "/dashboard/submissions" : `/dashboard/submissions?status=${status}`;
}

function toBatchListItem(submission: SubmissionListRow): SubmissionBatchListItem {
  return {
    id: submission.id,
    status: submission.status,
    createdAt: new Date(submission.created_at).toLocaleString(),
    sourceLabel: getSubmissionSourceLabel(submission),
    sourceDetail: getSubmissionSourceDetail(submission),
    metadataLabel: getMetadataStatusLabel(submission),
  };
}

function getSubmissionSourceLabel(submission: SubmissionListRow) {
  if (isCosSubmission(submission)) {
    return submission.pending_title ?? "原创";
  }

  return submission.source_url ?? submission.external_id;
}

function getSubmissionSourceDetail(submission: SubmissionListRow) {
  if (isCosSubmission(submission)) {
    return submission.source_ref ?? submission.external_id;
  }

  return `${getSubmissionPlatformLabel(submission)} / ${submission.external_id}`;
}

function getMetadataStatusLabel(submission: SubmissionListRow) {
  if (isCosSubmission(submission)) {
    return "本地上传";
  }

  return submission.fetched_at ? "已获取" : submission.fetch_error ? "获取失败" : "待获取";
}

function getSubmissionPlatformLabel(submission: SubmissionListRow) {
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

import { redirect } from "next/navigation";

import { Notice } from "@/components/dashboard/notice";
import { Pagination } from "@/components/dashboard/pagination";
import { SubmissionStatusNavigation } from "@/components/dashboard/submission-status-navigation";
import {
  SubmissionsBatchList,
  type SubmissionBatchListItem,
} from "@/components/dashboard/submissions-batch-list";
import { loadAdminPageData } from "@/lib/admin/auth";
import {
  getSubmissionStorageProvider,
  isCosSubmission,
  listSubmissionsPage,
} from "@/lib/review/queries";
import { buildSubmissionsHref, coerceSubmissionPage, coerceSubmissionStatus, submissionStatusTabs } from "@/lib/review/submission-navigation";
import type { SubmissionListRow } from "@/lib/review/types";

export const metadata = {
  title: "投稿",
};

const PAGE_SIZE = 20;

type SubmissionsPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    page?: string;
    status?: string;
  }>;
};

export default async function SubmissionsPage({ searchParams }: SubmissionsPageProps) {
  const { error, notice, page: pageParam, status: statusParam } = await searchParams;
  const status = coerceSubmissionStatus(statusParam);
  const page = coerceSubmissionPage(pageParam);
  const { rows, total } = await loadAdminPageData((supabase) =>
    listSubmissionsPage(supabase, { status, page, pageSize: PAGE_SIZE }),
  );
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage) {
    const params = new URLSearchParams(buildSubmissionsHref(status, lastPage).split("?")[1]);
    if (error) {
      params.set("error", error);
    }
    if (notice) {
      params.set("notice", notice);
    }
    redirect(`/dashboard/submissions${params.size ? `?${params}` : ""}`);
  }
  const items = rows.map(toBatchListItem);
  const activeTab = submissionStatusTabs.find((tab) => tab.value === status) ?? submissionStatusTabs[0];

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

      <SubmissionStatusNavigation status={status}>
        <SubmissionsBatchList items={items} key={`${status}:${page}`} returnPath={buildSubmissionsHref(status, page)} />
        <Pagination
          basePath="/dashboard/submissions"
          page={page}
          pageSize={PAGE_SIZE}
          searchParams={{ status: status === "pending" ? undefined : status }}
          total={total}
        />
      </SubmissionStatusNavigation>
    </div>
  );
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

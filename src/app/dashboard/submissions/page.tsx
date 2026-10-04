import { redirect } from "next/navigation";

import { Notice } from "@/components/dashboard/notice";
import { Pagination } from "@/components/dashboard/pagination";
import { SubmissionStatusNavigation } from "@/components/dashboard/submission-status-navigation";
import { SubmissionsBatchList } from "@/components/dashboard/submissions-batch-list";
import { loadAdminPageData } from "@/lib/admin/auth";
import {
  ensureSubmissionListMetadata,
  getSubmissionStorageProvider,
  listSubmissionsPage,
} from "@/lib/review/queries";
import { buildSubmissionListItem } from "@/lib/review/submission-list";
import { getCosPreviewUrl } from "@/lib/storage/cos/preview";
import { buildSubmissionsHref, coerceSubmissionPage, coerceSubmissionStatus, submissionStatusTabs } from "@/lib/review/submission-navigation";

export const metadata = {
  title: "投稿审核",
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
  const { rows, total, supabase } = await loadAdminPageData(async (supabase) => ({
    ...await listSubmissionsPage(supabase, { status, page, pageSize: PAGE_SIZE }),
    supabase,
  }));
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
  // The read above may run alongside authorization; metadata writes must wait
  // until loadAdminPageData has confirmed the administrator's role.
  const hydratedRows = await ensureSubmissionListMetadata(supabase, rows);
  const items = hydratedRows.map((submission) => {
    const provider = getSubmissionStorageProvider(submission);
    return buildSubmissionListItem(submission, provider, provider === "cos" ? getCosPreviewUrl(submission.cover_ref) : null);
  });
  const activeTab = submissionStatusTabs.find((tab) => tab.value === status) ?? submissionStatusTabs[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">内容管理</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">投稿审核</h1>
          <p className="mt-2 text-sm leading-6 text-subtle">先浏览封面与标题，再核对内容、分类并完成审核。</p>
        </div>
        <span className="border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.16em] text-subtle">
          {activeTab.label} {total} 条
        </span>
      </div>

      <Notice error={error} notice={notice} />

      <SubmissionStatusNavigation status={status}>
        <SubmissionsBatchList items={items} key={`${status}:${page}`} returnPath={buildSubmissionsHref(status, page)} status={status} />
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

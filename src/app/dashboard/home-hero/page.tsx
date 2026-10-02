import Link from "next/link";
import { redirect } from "next/navigation";

import {
  applyHomeHeroFeatureRequest,
  rejectHomeHeroFeatureRequest,
} from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import { AdminForm } from "@/components/dashboard/admin-form";
import { CoverPreview } from "@/components/dashboard/cover-preview";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { PendingButton } from "@/components/dashboard/pending-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { loadAdminPageData } from "@/lib/admin/auth";
import { buildMenuHref, coerceHomeHeroStatus, type MenuSearchParams } from "@/lib/review/menu-navigation";
import { coerceSubmissionPage } from "@/lib/review/submission-navigation";
import { getHomeHeroRequestApplyDisabledMessage } from "@/lib/review/home-hero";
import { listHomeHeroFeatureRequests } from "@/lib/review/queries";
import type {
  HomeHeroFeatureRequestRow,
  HomeHeroFeatureRequestStatus,
  SubmissionStatus,
} from "@/lib/review/types";

export const metadata = {
  title: "首页精选",
};

type HomeHeroPageProps = {
  searchParams: Promise<MenuSearchParams>;
};

const PAGE_SIZE = 20;

const requestStatusLabels: Record<HomeHeroFeatureRequestStatus, string> = {
  pending: "待处理",
  applied: "已应用",
  rejected: "已拒绝",
};

const submissionStatusLabels: Record<SubmissionStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

export default async function HomeHeroPage({ searchParams }: HomeHeroPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  const status = coerceHomeHeroStatus(params.status);
  const page = coerceSubmissionPage(typeof params.page === "string" ? params.page : undefined);
  const filters = { status: status === "pending" ? undefined : status };
  const returnPath = buildMenuHref("/dashboard/home-hero", { ...filters, page });
  const { rows: requests, total } = await loadAdminPageData((supabase) => listHomeHeroFeatureRequests(supabase, { status, page, pageSize: PAGE_SIZE }));
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage) {redirect(buildMenuHref("/dashboard/home-hero", { ...filters, page: lastPage, error, notice }));}
  const readyCount = requests.filter(
    (request) => getHomeHeroRequestApplyDisabledMessage(request) === null,
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">首页</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">首页精选申请</h1>
        </div>
        <div className="flex gap-2 text-xs uppercase tracking-[0.16em] text-subtle">
          <span className="border border-borderStrong px-2 py-1">{total} 条结果</span>
          <span className="border border-borderStrong px-2 py-1">本页 {readyCount} 可应用</span>
        </div>
      </div>

      <Notice error={error} notice={notice} />
      <p className="text-sm text-muted">设为首页精选会替换当前首页展示的视频。</p>
      <ListFilters filters={[{ name: "status", label: "申请状态", value: status, options: [
        { value: "pending", label: "待处理" }, { value: "applied", label: "已应用" },
        { value: "rejected", label: "已拒绝" }, { value: "all", label: "全部申请" },
      ] }]} key={returnPath} path="/dashboard/home-hero" summary={`共 ${total} 条，当前显示 ${requests.length} 条`} />

      <section className="overflow-hidden admin-card">
        <div className="hidden grid-cols-[96px_1.4fr_120px_120px_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle lg:grid">
          <span>封面</span>
          <span>投稿</span>
          <span>申请</span>
          <span>投稿状态</span>
          <span>操作</span>
        </div>
        {requests.length ? (
          requests.map((request) => (
            <HomeHeroRequestListItem key={request.submission_id} request={request} returnPath={returnPath} />
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">{status === "all" ? "暂无首页精选申请。" : "当前状态下暂无申请。"}</p>
            <p className="mt-2 text-sm text-muted">可切换到全部申请查看历史记录。</p>
          </div>
        )}
      </section>
      <Pagination basePath="/dashboard/home-hero" page={page} pageSize={PAGE_SIZE} searchParams={filters} total={total} />
    </div>
  );
}

function HomeHeroRequestListItem({ request, returnPath }: { request: HomeHeroFeatureRequestRow; returnPath: string }) {
  const disabledMessage = getHomeHeroRequestApplyDisabledMessage(request);
  const canReject = request.request_status === "pending";
  const title = request.title ?? "未命名投稿";

  return (
    <div className="grid gap-4 border-b border-border px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[96px_1.4fr_120px_120px_160px] lg:items-center">
      <div className="w-24"><CoverPreview src={request.cover_url} title={title} /></div>

      <div className="min-w-0 space-y-2">
        <Link className="block truncate text-base font-medium text-foreground hover:underline" href={`/dashboard/submissions/${request.submission_id}`} prefetch={false}>{title}</Link>
        <div className="flex flex-wrap gap-2 text-xs text-subtle">
          <span>{formatDateTime(request.created_at)}</span>
          <span>{request.video_id ? "视频已生成" : "视频未生成"}</span>
          <span>{request.published_at ? "已发布" : "未发布"}</span>
          <span>{request.cover_url ? "有封面" : "无封面"}</span>
        </div>
        <p className="truncate text-xs text-muted">
          {request.source_ref ?? request.source_url ?? request.submission_id}
        </p>
        {disabledMessage ? <p className="text-xs text-subtle">{disabledMessage}</p> : null}
      </div>

      <RequestStatusBadge status={request.request_status} />

      <div className="space-y-2">
        <StatusBadge status={request.submission_status} />
        <p className="text-xs text-subtle">{submissionStatusLabels[request.submission_status]}</p>
      </div>

      <AdminForm action={applyHomeHeroFeatureRequest} className="flex flex-col gap-2" label={`处理${title}精选申请`}>
          <input name="submissionId" type="hidden" value={request.submission_id} />
          <input name="returnPath" type="hidden" value={returnPath} />
          <PendingButton className="admin-button w-full" disabled={Boolean(disabledMessage)} pendingText="应用中…">
            设为首页精选
          </PendingButton>
          <PendingButton className="admin-secondary-button w-full" disabled={!canReject} formAction={rejectHomeHeroFeatureRequest} pendingText="拒绝中…">
            拒绝首页精选
          </PendingButton>
      </AdminForm>
    </div>
  );
}

function RequestStatusBadge({ status }: { status: HomeHeroFeatureRequestStatus }) {
  return (
    <span className="inline-flex w-fit border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.14em] text-muted">
      {requestStatusLabels[status]}
    </span>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

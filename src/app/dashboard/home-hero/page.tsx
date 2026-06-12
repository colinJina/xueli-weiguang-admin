import {
  applyHomeHeroFeatureRequest,
  rejectHomeHeroFeatureRequest,
} from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
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
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

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
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const requests = await listHomeHeroFeatureRequests(supabase);
  const pendingCount = requests.filter((request) => request.request_status === "pending").length;
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
          <span className="border border-borderStrong px-2 py-1">{pendingCount} 待处理</span>
          <span className="border border-borderStrong px-2 py-1">{readyCount} 可应用</span>
        </div>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[96px_1.4fr_120px_120px_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle lg:grid">
          <span>封面</span>
          <span>投稿</span>
          <span>申请</span>
          <span>投稿状态</span>
          <span>操作</span>
        </div>
        {requests.length ? (
          requests.map((request) => (
            <HomeHeroRequestListItem key={request.submission_id} request={request} />
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">暂无首页精选申请。</p>
            <p className="mt-2 text-sm text-muted">用户勾选推送为首页精选后会显示在这里。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function HomeHeroRequestListItem({ request }: { request: HomeHeroFeatureRequestRow }) {
  const disabledMessage = getHomeHeroRequestApplyDisabledMessage(request);
  const canReject = request.request_status === "pending";
  const title = request.title ?? "未命名投稿";

  return (
    <div className="grid gap-4 border-b border-border px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[96px_1.4fr_120px_120px_160px] lg:items-center">
      <CoverPreview coverUrl={request.cover_url} title={title} />

      <div className="min-w-0 space-y-2">
        <p className="truncate text-base font-medium text-foreground">{title}</p>
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

      <div className="flex flex-col gap-2">
        <form action={applyHomeHeroFeatureRequest}>
          <input name="submissionId" type="hidden" value={request.submission_id} />
          <button className="admin-button w-full" disabled={Boolean(disabledMessage)} type="submit">
            设为首页精选
          </button>
        </form>
        <form action={rejectHomeHeroFeatureRequest}>
          <input name="submissionId" type="hidden" value={request.submission_id} />
          <button className="admin-secondary-button w-full" disabled={!canReject} type="submit">
            拒绝首页精选
          </button>
        </form>
      </div>
    </div>
  );
}

function CoverPreview({ coverUrl, title }: { coverUrl: string | null; title: string }) {
  if (!coverUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center border border-border bg-panel text-xs text-subtle lg:w-24">
        无封面
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`${title} 封面`}
      className="aspect-video w-full border border-border object-cover lg:w-24"
      src={coverUrl}
    />
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

  return date.toLocaleString();
}

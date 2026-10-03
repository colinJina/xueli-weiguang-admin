import { notFound } from "next/navigation";

import { rejectSubmission, retryMetadataFetch } from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import { PendingButton } from "@/components/dashboard/pending-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { SubmissionCover } from "@/components/dashboard/submission-cover";
import { SubmissionReviewForm } from "@/components/dashboard/submission-review-form";
import { loadAdminPageData } from "@/lib/admin/auth";
import {
  ensureSubmissionMetadata,
  getSubmissionStorageProvider,
  getSubmissionOrNotFound,
  isCosSubmission,
  isExternalSubmission,
  listAllDictionaries,
} from "@/lib/review/queries";
import type { SubmissionRow } from "@/lib/review/types";

export const metadata = {
  title: "审核投稿",
};

type SubmissionDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: SubmissionDetailPageProps) {
  const [{ id }, { error, notice }] = await Promise.all([
    params,
    searchParams,
  ]);

  if (!id) {
    notFound();
  }

  const { submission, dictionaries, supabase } = await loadAdminPageData(async (supabase) => {
    const [submission, dictionaries] = await Promise.all([
      getSubmissionOrNotFound(supabase, id),
      listAllDictionaries(supabase),
    ]);
    return { submission, dictionaries, supabase };
  });
  const isExternal = isExternalSubmission(submission);
  const isCos = isCosSubmission(submission);
  // Metadata may write to the database, so only start it after admin authorization.
  const metadataState = await ensureSubmissionMetadata(supabase, submission);
  const canApprove =
    submission.status === "pending" &&
    (isExternal ? Boolean(metadataState.info) : isCos) &&
    dictionaries.categories.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">审核</p>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal">
            {getSubmissionTitle(submission)}
          </h1>
          <p className="mt-2 truncate text-sm text-muted">{getSubmissionSubtitle(submission)}</p>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      <Notice error={error ?? metadataState.error ?? undefined} notice={notice} />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="admin-card p-4">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-subtle">元数据</p>
              <h2 className="mt-2 text-lg font-semibold">
                {isCos ? "待审信息" : `${getSubmissionPlatformLabel(submission)} 详情`}
              </h2>
            </div>
            {isExternal && metadataState.error ? (
              <form action={retryMetadataFetch}>
                <input name="submissionId" type="hidden" value={submission.id} />
                <PendingButton className="admin-secondary-button" pendingText="重试中…">
                  重试
                </PendingButton>
              </form>
            ) : null}
          </div>

          {isCosSubmission(submission) ? (
            <CosPendingDetails submission={submission} />
          ) : metadataState.info ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
              <SubmissionCover
                src={metadataState.info.pic}
                title={metadataState.info.title}
              />
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-subtle">标题</p>
                  <p className="mt-1 text-base font-medium text-foreground">{metadataState.info.title}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="border border-border bg-panel p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-subtle">作者</p>
                    <p className="mt-1 truncate text-muted">{metadataState.info.ownerName}</p>
                  </div>
                  <div className="border border-border bg-panel p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-subtle">数据</p>
                    <p className="mt-1 text-muted">
                      {metadataState.info.viewCount} 次播放 / {metadataState.info.likeCount} 个赞
                    </p>
                  </div>
                </div>
                <p className="line-clamp-5 text-sm leading-6 text-muted">{metadataState.info.desc}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 border border-border bg-panel p-4 text-sm text-muted">
              元数据尚未缓存。
            </div>
          )}
        </div>

        <div className="space-y-4">
          <SubmissionReviewForm
            canApprove={canApprove}
            dictionaries={dictionaries}
            disabledMessage={getApprovalDisabledMessage(submission, isExternal, isCos)}
            isExternal={isExternal}
            isPending={submission.status === "pending"}
            key={submission.id}
            submissionId={submission.id}
          />

          <form action={rejectSubmission} className="space-y-4 admin-card p-4">
            <input name="submissionId" type="hidden" value={submission.id} />
            <div className="border-b border-border pb-3">
              <p className="text-xs uppercase tracking-[0.18em] text-subtle">拒绝</p>
              <h2 className="mt-2 text-lg font-semibold">关闭投稿</h2>
            </div>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-subtle">原因</span>
              <textarea className="admin-input h-auto min-h-20 py-2" name="reviewNote" />
            </label>
            <PendingButton
              className="admin-secondary-button w-full"
              disabled={submission.status !== "pending"}
              pendingText="拒绝中…"
            >
              拒绝投稿
            </PendingButton>
          </form>
        </div>
      </section>
    </div>
  );
}

function getSubmissionTitle(submission: SubmissionRow) {
  if (isCosSubmission(submission)) {
    return submission.pending_title ?? submission.source_ref ?? submission.external_id;
  }

  return submission.external_id;
}

function getSubmissionSubtitle(submission: SubmissionRow) {
  if (isCosSubmission(submission)) {
    return submission.source_ref ? `原创 / 本地上传 / ${submission.source_ref}` : "原创 / 本地上传";
  }

  return `${getSubmissionPlatformLabel(submission)} / ${
    submission.source_url ?? submission.external_id
  }`;
}

function getApprovalDisabledMessage(
  submission: SubmissionRow,
  isExternal: boolean,
  isCos: boolean,
) {
  if (!isExternal && !isCos) {
    return "不支持的投稿来源。";
  }

  if (submission.status !== "pending") {
    return "只能审核待处理投稿。";
  }

  if (isCos) {
    return "通过审核需要至少有一个分类。";
  }

  return "通过审核需要已缓存元数据，并且至少有一个分类。";
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

function CosPendingDetails({ submission }: { submission: SubmissionRow }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-3">
        <DetailField label="标题" value={submission.pending_title} />
        <DetailField label="简介" value={submission.pending_description} preserveLines />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailField label="来源" value="原创" />
        <DetailField label="上传方式" value="本地上传" />
        <DetailField label="文件大小" value={formatFileSize(submission.file_size)} />
        <DetailField label="MIME" value={submission.mime_type} />
      </div>

      <div className="grid gap-3 text-sm">
        <DetailField label="视频对象" value={submission.source_ref} breakAll />
        <DetailField label="封面对象" value={submission.cover_ref} breakAll />
        <DetailField label="视频 ETag" value={submission.source_etag} breakAll />
        <DetailField label="封面 ETag" value={submission.cover_etag} breakAll />
      </div>
    </div>
  );
}

function DetailField({
  breakAll = false,
  label,
  preserveLines = false,
  value,
}: {
  breakAll?: boolean;
  label: string;
  preserveLines?: boolean;
  value: number | string | null | undefined;
}) {
  return (
    <div className="border border-border bg-panel p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p
        className={[
          "mt-1 text-muted",
          breakAll ? "break-all" : "",
          preserveLines ? "whitespace-pre-wrap leading-6" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatOptionalValue(value)}
      </p>
    </div>
  );
}

function formatOptionalValue(value: number | string | null | undefined) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "未记录";
  }

  return value;
}

function formatFileSize(value: number | string | null) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

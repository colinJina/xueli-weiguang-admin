import { notFound } from "next/navigation";
import Link from "next/link";

import { rejectSubmission, retryMetadataFetch } from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import { PendingButton } from "@/components/dashboard/pending-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { CoverPreview } from "@/components/dashboard/cover-preview";
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
import { formatSubmissionDuration } from "@/lib/review/submission-list";
import { getCosPreviewUrl } from "@/lib/storage/cos/preview";

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
  const title = metadataState.info?.title || submission.pending_title || "待获取投稿标题";
  const watchUrl = getSubmissionWatchUrl(submission);
  const cosCoverUrl = isCos ? getCosPreviewUrl(submission.cover_ref) : null;
  const cosVideoUrl = isCos ? getCosPreviewUrl(submission.source_ref) : null;
  const canApprove =
    submission.status === "pending" &&
    (isExternal ? Boolean(metadataState.info) : isCos) &&
    dictionaries.categories.length > 0;

  return (
    <div className="space-y-5">
      <Link className="inline-flex items-center gap-2 text-sm text-subtle hover:text-foreground" href="/dashboard/submissions"><span aria-hidden="true">←</span> 返回审核队列</Link>
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">投稿审核</p>
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-normal">
            {title}
          </h1>
          <p className="mt-2 text-sm text-subtle">{getSubmissionPlatformLabel(submission)} · 核对封面、视频内容和简介后完成审核</p>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      <Notice error={error ?? metadataState.error ?? undefined} notice={notice} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="admin-card min-w-0 p-4">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-lg font-semibold">投稿内容</h2>
              <p className="mt-1 text-xs text-subtle">检查封面与内容是否相符，以及内容是否适合发布。</p>
            </div>
            {isExternal && metadataState.error ? (
              <form action={retryMetadataFetch}>
                <input name="submissionId" type="hidden" value={submission.id} />
                <PendingButton className="admin-secondary-button" pendingText="重试中…">
                  重新获取内容
                </PendingButton>
              </form>
            ) : null}
          </div>

          {isCosSubmission(submission) ? (
            <>
              <div className="mt-4">
                {cosVideoUrl ? (
                  <video aria-label="原创投稿视频预览" className="aspect-video w-full rounded-control border border-border bg-panel" controls playsInline poster={cosCoverUrl ?? undefined} preload="none" src={cosVideoUrl}>
                    浏览器不支持视频预览，请打开视频查看。
                  </video>
                ) : <CoverPreview contain priority sizes="(max-width: 1023px) 100vw, 600px" src={cosCoverUrl} title={title} />}
                <div className="mt-3 flex flex-wrap gap-2">
                  {cosVideoUrl ? <a className="admin-secondary-button" href={cosVideoUrl} referrerPolicy="no-referrer" rel="noreferrer" target="_blank">打开视频 ↗</a> : null}
                  {cosCoverUrl ? <a className="admin-secondary-button" href={cosCoverUrl} referrerPolicy="no-referrer" rel="noreferrer" target="_blank">查看完整封面 ↗</a> : null}
                </div>
                {!cosVideoUrl ? <p className="mt-3 text-sm text-amber-300">视频预览暂不可用，请核实上传文件。</p> : null}
              </div>
              <CosPendingDetails submission={submission} />
            </>
          ) : metadataState.info ? (
            <div className="mt-4 space-y-4">
              <CoverPreview
                contain
                priority
                sizes="(max-width: 1023px) 100vw, 600px"
                src={metadataState.info.pic}
                title={metadataState.info.title}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-subtle">{formatSubmissionDuration(metadataState.info.duration) ? `视频时长 ${formatSubmissionDuration(metadataState.info.duration)}` : "封面预览"}</span>
                {watchUrl ? <a className="admin-secondary-button" href={watchUrl} referrerPolicy="no-referrer" rel="noreferrer" target="_blank">查看原视频 ↗</a> : null}
              </div>
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
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs text-subtle">内容简介</p>
                  <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-muted">{metadataState.info.desc || "投稿未提供简介。"}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 border border-border bg-panel p-4 text-sm text-muted">
              <p>暂时无法预览投稿内容，请重新获取后核实。</p>
              {watchUrl ? <a className="admin-secondary-button mt-3" href={watchUrl} rel="noreferrer" target="_blank">查看原视频 ↗</a> : null}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {submission.status === "pending" ? <SubmissionReviewForm
            canApprove={canApprove}
            dictionaries={dictionaries}
            disabledMessage={getApprovalDisabledMessage(submission, isExternal, isCos)}
            isExternal={isExternal}
            isPending={submission.status === "pending"}
            key={submission.id}
            submissionId={submission.id}
          /> : null}

          {submission.status === "pending" ? <form action={rejectSubmission} className="space-y-4 admin-card p-4">
            <input name="submissionId" type="hidden" value={submission.id} />
            <div className="border-b border-border pb-3">
              <h2 className="text-lg font-semibold">不适合发布？</h2>
              <p className="mt-1 text-xs text-subtle">填写原因，方便后续回看审核记录。</p>
            </div>
            <label className="block space-y-2">
              <span className="text-xs text-muted">拒绝原因</span>
              <textarea className="admin-input h-auto min-h-20 py-2" name="reviewNote" placeholder="例如：内容与封面不符、内容不符合收录范围" />
            </label>
            <PendingButton
              className="admin-secondary-button w-full"
              disabled={submission.status !== "pending"}
              pendingText="拒绝中…"
            >
              拒绝投稿
            </PendingButton>
          </form> : (
            <div className="admin-card p-4">
              <h2 className="font-medium">审核记录</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{submission.review_note || "本次审核未填写备注。"}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function getSubmissionWatchUrl(submission: SubmissionRow) {
  const provider = getSubmissionStorageProvider(submission);
  if (provider === "bilibili") { return `https://www.bilibili.com/video/${encodeURIComponent(submission.external_id)}`; }
  if (provider === "youtube") { return `https://www.youtube.com/watch?v=${encodeURIComponent(submission.external_id)}`; }
  return null;
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
    return "原创上传";
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
        <DetailField label="文件大小" value={formatFileSize(submission.file_size)} />
      </div>

      <details className="rounded-control border border-border text-sm">
        <summary className="cursor-pointer px-3 py-3 text-subtle hover:text-foreground">文件信息（排查问题时查看）</summary>
        <div className="grid gap-3 border-t border-border p-3">
          <DetailField label="文件类型" value={submission.mime_type} />
          <DetailField label="视频对象" value={submission.source_ref} breakAll />
          <DetailField label="封面对象" value={submission.cover_ref} breakAll />
          <DetailField label="视频 ETag" value={submission.source_etag} breakAll />
          <DetailField label="封面 ETag" value={submission.cover_etag} breakAll />
        </div>
      </details>
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

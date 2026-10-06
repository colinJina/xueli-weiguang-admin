import { getExternalCoverUrl } from "@/lib/review/cover-image";
import type { SubmissionListRow, SubmissionStatus, SubmissionStorageProviderKind } from "@/lib/review/types";

export type SubmissionBatchListItem = {
  id: string;
  status: SubmissionStatus;
  title: string;
  coverUrl: string | null;
  author: string | null;
  duration: string | null;
  platformLabel: string;
  createdAt: string;
  reviewHint: { label: string; description: string; needsAttention: boolean };
};

const submissionDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

export function buildSubmissionListItem(
  submission: SubmissionListRow,
  provider: SubmissionStorageProviderKind,
  cosCoverUrl: string | null = null,
): SubmissionBatchListItem {
  const isOriginal = provider === "cos";
  const title = (isOriginal ? submission.pending_title : submission.fetched_title)?.trim();
  const coverUrl = isOriginal ? cosCoverUrl : getExternalCoverUrl(submission.fetched_cover);
  const platformLabel = { bilibili: "Bilibili", youtube: "YouTube", cos: "原创上传", unsupported: "其他投稿" }[provider];
  let reviewHint: SubmissionBatchListItem["reviewHint"];
  if (provider === "unsupported") {
    reviewHint = { label: "需人工核实", description: "暂不支持此类投稿的发布", needsAttention: true };
  } else if (!isOriginal && submission.fetch_error) {
    reviewHint = { label: "信息获取失败", description: "进入详情重试获取内容", needsAttention: true };
  } else if (!isOriginal && !submission.fetched_at) {
    reviewHint = { label: "信息待获取", description: "打开审核列表时自动获取内容", needsAttention: true };
  } else if (!title) {
    reviewHint = { label: "标题缺失", description: "进入详情核实投稿信息", needsAttention: true };
  } else if (!coverUrl) {
    reviewHint = { label: "封面待核实", description: "进入详情检查封面是否可用", needsAttention: true };
  } else {
    reviewHint = { label: "可查看内容", description: "核对内容后完成审核", needsAttention: false };
  }
  return {
    id: submission.id,
    status: submission.status,
    title: title || (isOriginal ? "未命名原创投稿" : "待获取投稿标题"),
    coverUrl,
    author: isOriginal ? null : submission.fetched_author?.trim() || null,
    duration: formatSubmissionDuration(submission.fetched_duration),
    platformLabel,
    createdAt: submissionDateFormatter.format(new Date(submission.created_at)),
    reviewHint,
  };
}

export function formatSubmissionDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) { return null; }
  const total = Math.floor(value);
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

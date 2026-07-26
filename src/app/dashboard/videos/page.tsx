import { deletePublishedVideo } from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import { Pagination } from "@/components/dashboard/pagination";
import { PendingButton } from "@/components/dashboard/pending-button";
import { requireAdmin } from "@/lib/admin/auth";
import { getSubmissionStorageProvider, listPublishedVideosPage } from "@/lib/review/queries";
import type { PublishedVideoRow } from "@/lib/review/types";

export const metadata = {
  title: "视频",
};

const PAGE_SIZE = 20;

type VideosPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    page?: string;
  }>;
};

export default async function VideosPage({ searchParams }: VideosPageProps) {
  const [{ error, notice, page: pageParam }, { supabase }] = await Promise.all([
    searchParams,
    requireAdmin(),
  ]);
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const { rows: videos, total } = await listPublishedVideosPage(supabase, {
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">视频</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">已发布档案</h1>
        </div>
        <span className="border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.16em] text-subtle">
          {total} 已发布
        </span>
      </div>

      <Notice error={error} notice={notice} />

      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[1.2fr_150px_140px_220px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle lg:grid">
          <span>标题</span>
          <span>作者</span>
          <span>发布时间</span>
          <span>操作</span>
        </div>
        {videos.length ? (
          videos.map((video) => <PublishedVideoListItem key={video.id} video={video} />)
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">暂无已发布视频。</p>
            <p className="mt-2 text-sm text-muted">审核通过的投稿会显示在这里。</p>
          </div>
        )}
      </section>

      <Pagination
        basePath="/dashboard/videos"
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </div>
  );
}

function PublishedVideoListItem({ video }: { video: PublishedVideoRow }) {
  const className =
    "grid gap-3 border-b border-border px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[1.2fr_150px_140px_220px] lg:items-center";

  return (
    <div className={className}>
      <span className="min-w-0">
        {video.source_url ? (
          <a
            className="block truncate text-foreground transition hover:text-muted"
            href={video.source_url}
            rel="noreferrer"
            target="_blank"
          >
            {video.title}
          </a>
        ) : (
          <span className="block truncate text-foreground">{video.title}</span>
        )}
        <span className="mt-1 block truncate text-xs text-subtle">
          {getPublishedVideoPlatformLabel(video)}
        </span>
      </span>
      <span className="truncate text-muted">{video.author_name ?? "--"}</span>
      <span className="text-muted">
        {video.published_at ? new Date(video.published_at).toLocaleDateString() : "--"}
      </span>
      <DeleteVideoForm
        isCos={getSubmissionStorageProvider(video) === "cos"}
        videoId={video.id}
      />
    </div>
  );
}

function getPublishedVideoPlatformLabel({ platform, storage_provider }: PublishedVideoRow) {
  const storageProvider = getSubmissionStorageProvider({ platform, storage_provider });

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

function DeleteVideoForm({ isCos, videoId }: { isCos: boolean; videoId: string }) {
  return (
    <form action={deletePublishedVideo} className="flex flex-col gap-2">
      <input name="videoId" type="hidden" value={videoId} />
      <label className="flex items-center gap-2 text-xs text-subtle">
        <input
          className="h-4 w-4 accent-foreground"
          name="confirmDelete"
          required
          type="checkbox"
          value="confirmed"
        />
        <span>{isCos ? "确认删除发布文件" : "确认下架"}</span>
      </label>
      <PendingButton className="admin-secondary-button w-full border-border text-subtle">
        {isCos ? "删除 COS 视频" : "下架视频"}
      </PendingButton>
    </form>
  );
}

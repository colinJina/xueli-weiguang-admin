import { requireAdmin } from "@/lib/admin/auth";
import { listPublishedVideos } from "@/lib/review/queries";

export const metadata = {
  title: "视频",
};

export default async function VideosPage() {
  const { supabase } = await requireAdmin();
  const videos = await listPublishedVideos(supabase);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">视频</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">已发布档案</h1>
        </div>
        <span className="border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.16em] text-subtle">
          {videos.length} 已发布
        </span>
      </div>

      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[1.3fr_160px_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle md:grid">
          <span>标题</span>
          <span>作者</span>
          <span>发布时间</span>
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
    </div>
  );
}

function PublishedVideoListItem({
  video,
}: {
  video: Awaited<ReturnType<typeof listPublishedVideos>>[number];
}) {
  const className =
    "grid gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-panel md:grid-cols-[1.3fr_160px_160px] md:items-center";
  const content = (
    <>
      <span className="min-w-0 truncate text-foreground">{video.title}</span>
      <span className="truncate text-muted">{video.author_name ?? "--"}</span>
      <span className="text-muted">
        {video.published_at ? new Date(video.published_at).toLocaleDateString() : "--"}
      </span>
    </>
  );

  if (!video.source_url) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a className={className} href={video.source_url} rel="noreferrer" target="_blank">
      {content}
    </a>
  );
}

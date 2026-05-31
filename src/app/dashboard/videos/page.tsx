import { requireAdmin } from "@/lib/admin/auth";
import { listPublishedVideos } from "@/lib/review/queries";

export const metadata = {
  title: "Videos",
};

export default async function VideosPage() {
  const { supabase } = await requireAdmin();
  const videos = await listPublishedVideos(supabase);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Videos</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Published archive</h1>
        </div>
        <span className="border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.16em] text-subtle">
          {videos.length} Published
        </span>
      </div>

      <section className="overflow-hidden border border-border bg-surface">
        <div className="hidden grid-cols-[1.3fr_160px_160px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle md:grid">
          <span>Title</span>
          <span>Author</span>
          <span>Published</span>
        </div>
        {videos.length ? (
          videos.map((video) => (
            <a
              className="grid gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-panel md:grid-cols-[1.3fr_160px_160px] md:items-center"
              href={video.source_url}
              key={video.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="min-w-0 truncate text-foreground">{video.title}</span>
              <span className="truncate text-muted">{video.author_name ?? "--"}</span>
              <span className="text-muted">
                {video.published_at ? new Date(video.published_at).toLocaleDateString() : "--"}
              </span>
            </a>
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">No published videos yet.</p>
            <p className="mt-2 text-sm text-muted">Approved submissions will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { deletePublishedVideo } from "@/app/dashboard/actions";
import { AdminForm } from "@/components/dashboard/admin-form";
import { CoverPreview } from "@/components/dashboard/cover-preview";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Notice } from "@/components/dashboard/notice";
import { Pagination } from "@/components/dashboard/pagination";
import { PendingButton } from "@/components/dashboard/pending-button";
import { loadAdminPageData } from "@/lib/admin/auth";
import { getSubmissionStorageProvider, listPublishedVideosPage } from "@/lib/review/queries";
import { buildMenuHref, coerceVideoSource, normalizeSearch, type MenuSearchParams } from "@/lib/review/menu-navigation";
import { coerceSubmissionPage } from "@/lib/review/submission-navigation";
import type { PublishedVideoRow } from "@/lib/review/types";

export const metadata = {
  title: "视频",
};

const PAGE_SIZE = 20;

type VideosPageProps = {
  searchParams: Promise<MenuSearchParams>;
};

export default async function VideosPage({ searchParams }: VideosPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  const page = coerceSubmissionPage(typeof params.page === "string" ? params.page : undefined);
  const query = normalizeSearch(params.q);
  const source = coerceVideoSource(params.source);
  const filters = { q: query, source: source === "all" ? undefined : source };
  const returnPath = buildMenuHref("/dashboard/videos", { ...filters, page });
  const { rows: videos, total } = await loadAdminPageData((supabase) => listPublishedVideosPage(supabase, {
    page,
    pageSize: PAGE_SIZE,
    query,
    source,
  }));
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage) {redirect(buildMenuHref("/dashboard/videos", { ...filters, page: lastPage, error, notice }));}

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">视频</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">已发布档案</h1>
        </div>
        <span className="border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.16em] text-subtle">
          {total} 条结果
        </span>
      </div>

      <Notice error={error} notice={notice} />
      <ListFilters
        filters={[{ name: "source", label: "视频来源", value: source, options: [
          { value: "all", label: "全部来源" }, { value: "bilibili", label: "Bilibili" },
          { value: "youtube", label: "YouTube" }, { value: "cos", label: "COS 原创" },
        ] }]}
        key={returnPath}
        path="/dashboard/videos"
        placeholder="搜索视频标题"
        query={query}
        summary={`共 ${total} 条，当前显示 ${videos.length} 条`}
      />

      <section className="overflow-hidden admin-card">
        <div className="hidden grid-cols-[1.2fr_150px_140px_220px] border-b border-border bg-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-subtle lg:grid">
          <span>标题</span>
          <span>作者</span>
          <span>发布时间</span>
          <span>操作</span>
        </div>
        {videos.length ? (
          videos.map((video) => <PublishedVideoListItem key={video.id} returnPath={returnPath} video={video} />)
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">{query || source !== "all" ? "没有符合筛选条件的视频。" : "暂无已发布视频。"}</p>
            <p className="mt-2 text-sm text-muted">{query || source !== "all" ? "调整标题关键词或重置来源筛选。" : "审核通过的投稿会显示在这里。"}</p>
          </div>
        )}
      </section>

      <Pagination
        basePath="/dashboard/videos"
        page={page}
        pageSize={PAGE_SIZE}
        searchParams={filters}
        total={total}
      />
    </div>
  );
}

function PublishedVideoListItem({ video, returnPath }: { video: PublishedVideoRow; returnPath: string }) {
  const className =
    "grid gap-3 border-b border-border px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[1.2fr_150px_140px_220px] lg:items-center";

  return (
    <div className={className}>
      <div className="flex min-w-0 gap-3">
        <div className="w-24 shrink-0"><CoverPreview src={video.cover_url} title={video.title} /></div>
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
        <Link className="mt-1 inline-block text-xs text-subtle underline" href={`/dashboard/submissions/${video.submission_id}`} prefetch={false}>查看投稿详情</Link>
        </span>
      </div>
      <span className="truncate text-muted">{video.author_name ?? "--"}</span>
      <span className="text-muted">
        {video.published_at ? new Date(video.published_at).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "--"}
      </span>
      <DeleteVideoForm
        isCos={getSubmissionStorageProvider(video) === "cos"}
        videoId={video.id}
        returnPath={returnPath}
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

function DeleteVideoForm({ isCos, videoId, returnPath }: { isCos: boolean; videoId: string; returnPath: string }) {
  return (
    <AdminForm action={deletePublishedVideo} className="flex flex-col gap-2" label="下架视频">
      <input name="videoId" type="hidden" value={videoId} />
      <input name="returnPath" type="hidden" value={returnPath} />
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
    </AdminForm>
  );
}

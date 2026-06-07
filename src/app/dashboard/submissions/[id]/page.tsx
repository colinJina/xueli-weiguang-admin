import { notFound } from "next/navigation";

import { approveSubmission, rejectSubmission, retryMetadataFetch } from "@/app/dashboard/actions";
import { Notice } from "@/components/dashboard/notice";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
import {
  ensureSubmissionMetadata,
  getSubmissionOrNotFound,
  listAllDictionaries,
} from "@/lib/review/queries";

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
  const [{ id }, { error, notice }, { supabase }] = await Promise.all([
    params,
    searchParams,
    requireAdmin(),
  ]);

  if (!id) {
    notFound();
  }

  const submission = await getSubmissionOrNotFound(supabase, id);
  const [metadataState, dictionaries] = await Promise.all([
    ensureSubmissionMetadata(supabase, submission),
    listAllDictionaries(supabase),
  ]);

  const canApprove =
    submission.status === "pending" && Boolean(metadataState.info) && dictionaries.categories.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">审核</p>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal">
            {submission.external_id}
          </h1>
          <p className="mt-2 truncate text-sm text-muted">{submission.source_url}</p>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      <Notice error={error ?? metadataState.error ?? undefined} notice={notice} />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-subtle">元数据</p>
              <h2 className="mt-2 text-lg font-semibold">Bilibili 详情</h2>
            </div>
            {metadataState.error ? (
              <form action={retryMetadataFetch}>
                <input name="submissionId" type="hidden" value={submission.id} />
                <button className="admin-secondary-button" type="submit">
                  重试
                </button>
              </form>
            ) : null}
          </div>

          {metadataState.info ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="aspect-video w-full border border-border object-cover"
                src={metadataState.info.pic}
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
          <form action={approveSubmission} className="space-y-4 border border-border bg-surface p-4">
            <input name="submissionId" type="hidden" value={submission.id} />
            <div className="border-b border-border pb-3">
              <p className="text-xs uppercase tracking-[0.18em] text-subtle">通过</p>
              <h2 className="mt-2 text-lg font-semibold">发布到档案</h2>
            </div>

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-subtle">分类</span>
              <select className="admin-input" disabled={!canApprove} name="categoryId" required>
                <option value="">选择分类</option>
                {dictionaries.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <CheckboxGroup items={dictionaries.tags} label="标签，最多 4 个" name="tagIds" />
            <ToneColorGroup items={dictionaries.tones} label="色调，最多 3 个" name="toneIds" />

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-subtle">审核备注</span>
              <textarea className="admin-input h-auto min-h-24 py-2" name="reviewNote" />
            </label>

            <button className="admin-button w-full" disabled={!canApprove} type="submit">
              通过审核
            </button>
            {!canApprove ? (
              <p className="text-xs text-subtle">
                通过审核需要投稿处于待审核状态、已缓存元数据，并且至少有一个分类。
              </p>
            ) : null}
          </form>

          <form action={rejectSubmission} className="space-y-4 border border-border bg-surface p-4">
            <input name="submissionId" type="hidden" value={submission.id} />
            <div className="border-b border-border pb-3">
              <p className="text-xs uppercase tracking-[0.18em] text-subtle">拒绝</p>
              <h2 className="mt-2 text-lg font-semibold">关闭投稿</h2>
            </div>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-subtle">原因</span>
              <textarea className="admin-input h-auto min-h-20 py-2" name="reviewNote" />
            </label>
            <button
              className="admin-secondary-button w-full"
              disabled={submission.status !== "pending"}
              type="submit"
            >
              拒绝投稿
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function CheckboxGroup({
  items,
  label,
  name,
}: {
  items: Array<{ id: string; name: string }>;
  label: string;
  name: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <label className="flex items-center gap-2 border border-border bg-panel px-3 py-2" key={item.id}>
              <input className="h-4 w-4 accent-white" name={name} type="checkbox" value={item.id} />
              <span className="text-sm text-muted">{item.name}</span>
            </label>
          ))
        ) : (
          <p className="text-sm text-muted">暂无条目。</p>
        )}
      </div>
    </fieldset>
  );
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function ToneColorGroup({
  items,
  label,
  name,
}: {
  items: Array<{ color_hex?: string | null; id: string; name: string }>;
  label: string;
  name: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.length ? (
          items.map((item) => (
            <label
              className="flex cursor-pointer flex-col items-center gap-2 border border-border bg-panel px-3 py-3 transition hover:border-muted"
              key={item.id}
            >
              <input className="peer sr-only" name={name} type="checkbox" value={item.id} />
              <span
                aria-hidden="true"
                className="h-12 w-12 rounded-full border border-borderStrong shadow-[0_0_0_4px_rgba(255,255,255,0.04)] transition peer-checked:scale-95 peer-checked:border-foreground peer-checked:shadow-[0_0_0_4px_rgba(255,255,255,0.18)]"
                style={{ backgroundColor: getToneColor(item) }}
              />
              <span className="max-w-full truncate text-center text-xs text-muted peer-checked:text-foreground">
                {item.name}
              </span>
            </label>
          ))
        ) : (
          <p className="text-sm text-muted">暂无条目。</p>
        )}
      </div>
    </fieldset>
  );
}

function getToneColor(item: { color_hex?: string | null; name: string }) {
  const color = item.color_hex ?? item.name;
  return HEX_COLOR_PATTERN.test(color) ? color : "#D4D4D4";
}

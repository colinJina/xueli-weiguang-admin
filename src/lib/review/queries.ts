import { notFound } from "next/navigation";

import { fetchBilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";
import { fetchYouTubeVideoInfo } from "@/lib/youtube/fetch-video-info";
import {
  asReviewFetchedMeta,
  type ReviewFetchedMeta,
} from "@/lib/review/fetched-meta";
import { getSafeActionMessage } from "@/lib/review/review-utils";
import { coerceSubmissionPage } from "@/lib/review/submission-navigation";
import { escapeLikePattern, normalizeSearch, coerceVideoSource, coerceHomeHeroStatus, type VideoSourceFilter, type HomeHeroStatusFilter } from "@/lib/review/menu-navigation";
import type {
  DictionaryItem,
  HomeHeroFeatureRequestRow,
  HomeHeroFeatureRequestStatus,
  PublishedVideoRow,
  SubmissionListRow,
  SubmissionRow,
  SubmissionStatus,
  SubmissionStatusFilter,
  SubmissionStorageProviderKind,
} from "@/lib/review/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export { asReviewFetchedMeta };

const submissionSelectColumns =
  "id,user_id,platform,storage_provider,source_url,external_id,status,auto_fetched_meta,fetched_at,fetch_error,pending_title,pending_description,file_size,mime_type,source_ref,cover_ref,source_etag,cover_etag,reviewed_by,review_note,created_at,reviewed_at";

const submissionListColumns =
  "id,platform,storage_provider,source_url,external_id,source_ref,pending_title,cover_ref,status,fetched_at,fetch_error,created_at,fetched_title:auto_fetched_meta->>title,fetched_cover:auto_fetched_meta->>pic,fetched_author:auto_fetched_meta->>ownerName,fetched_duration:auto_fetched_meta->duration";

const publishedVideoColumns =
  "id,submission_id,platform,storage_provider,source_url,embed_url,playback_ref,title,cover_url,author_name,view_count,like_count,category_id,published_at,created_at";

// PostgREST 对超出总行数的 range 会返回 416（PGRST103），这里视为空页。
const OUT_OF_RANGE_CODE = "PGRST103";

type HomeHeroFeatureRequestTableRow = {
  submission_id: string;
  status: HomeHeroFeatureRequestStatus;
  created_at: string;
  submission: HomeHeroSubmissionSummaryRow & {
    video: HomeHeroVideoSummaryRow | HomeHeroVideoSummaryRow[] | null;
  };
};

type HomeHeroSubmissionSummaryRow = {
  id: string;
  status: SubmissionStatus;
  created_at: string;
  pending_title: string | null;
  source_url: string | null;
  source_ref: string | null;
  external_id: string | null;
};

type HomeHeroVideoSummaryRow = {
  id: string;
  submission_id: string;
  title: string | null;
  cover_url: string | null;
  published_at: string | null;
  created_at: string;
};

export const asBilibiliVideoInfo = asReviewFetchedMeta;

export async function listSubmissionsPage(
  supabase: SupabaseClient,
  {
    status = "pending",
    page = 1,
    pageSize = 20,
  }: { status?: SubmissionStatusFilter; page?: number; pageSize?: number } = {},
) {
  page = coerceSubmissionPage(page);
  pageSize = Number.isSafeInteger(pageSize) ? Math.min(100, Math.max(1, pageSize)) : 20;
  const from = (page - 1) * pageSize;
  let query = supabase.from("submissions").select(submissionListColumns, { count: "exact" });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    if (error.code === OUT_OF_RANGE_CODE) {
      return { rows: [] as SubmissionListRow[], total: count ?? await countSubmissions(supabase, status === "all" ? undefined : status) };
    }

    throw new Error(error.message);
  }

  return { rows: (data ?? []) as SubmissionListRow[], total: count ?? 0 };
}

export async function listPublishedVideosPage(
  supabase: SupabaseClient,
  { page = 1, pageSize = 20, query = "", source = "all" }: {
    page?: number; pageSize?: number; query?: string; source?: VideoSourceFilter;
  } = {},
) {
  page = coerceSubmissionPage(page);
  pageSize = Number.isSafeInteger(pageSize) ? Math.min(100, Math.max(1, pageSize)) : 20;
  query = normalizeSearch(query);
  source = coerceVideoSource(source);
  const from = (page - 1) * pageSize;
  const filteredQuery = (head = false) => {
    let request = supabase.from("videos").select(head ? "id" : publishedVideoColumns, { count: "exact", head });
    if (query) {
      request = request.ilike("title", `%${escapeLikePattern(query)}%`);
    }
    if (source !== "all") {
      request = request.eq("platform", source);
    }
    return request;
  };
  const { data, error, count } = await filteredQuery()
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    if (error.code === OUT_OF_RANGE_CODE) {
      const counted = count === null ? await filteredQuery(true) : { count, error: null };
      if (counted.error) {
        throw new Error(counted.error.message);
      }
      return { rows: [] as PublishedVideoRow[], total: counted.count ?? 0 };
    }

    throw new Error(error.message);
  }

  return { rows: (data ?? []) as unknown as PublishedVideoRow[], total: count ?? 0 };
}

export async function countSubmissions(supabase: SupabaseClient, status?: SubmissionStatus) {
  let query = supabase.from("submissions").select("id", { count: "exact", head: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function countPublishedVideos(supabase: SupabaseClient) {
  const { error, count } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getSubmissionOrNotFound(supabase: SupabaseClient, id: string) {
  const data = await getSubmissionById(supabase, id);

  if (!data) {
    notFound();
  }

  return data;
}

export async function getSubmissionById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("submissions")
    .select(submissionSelectColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as SubmissionRow) : null;
}

export function getSubmissionStorageProvider(
  submission: Pick<SubmissionRow, "platform" | "storage_provider">,
): SubmissionStorageProviderKind {
  if (submission.storage_provider === "cos" || submission.platform === "cos") {
    return "cos";
  }

  if (submission.storage_provider === "youtube" || submission.platform === "youtube") {
    return "youtube";
  }

  if (submission.storage_provider === "bilibili" || submission.platform === "bilibili") {
    return "bilibili";
  }

  return "unsupported";
}

export function isBilibiliSubmission(
  submission: Pick<SubmissionRow, "platform" | "storage_provider">,
) {
  return getSubmissionStorageProvider(submission) === "bilibili";
}

export function isYouTubeSubmission(
  submission: Pick<SubmissionRow, "platform" | "storage_provider">,
) {
  return getSubmissionStorageProvider(submission) === "youtube";
}

export function isCosSubmission(submission: Pick<SubmissionRow, "platform" | "storage_provider">) {
  return getSubmissionStorageProvider(submission) === "cos";
}

export function isExternalSubmission(
  submission: Pick<SubmissionRow, "platform" | "storage_provider">,
) {
  const storageProvider = getSubmissionStorageProvider(submission);
  return storageProvider === "bilibili" || storageProvider === "youtube";
}

export async function fetchExternalSubmissionMetadata(
  submission: Pick<SubmissionRow, "external_id" | "platform" | "storage_provider">,
): Promise<ReviewFetchedMeta> {
  const storageProvider = getSubmissionStorageProvider(submission);

  if (storageProvider === "bilibili") {
    return fetchBilibiliVideoInfo(submission.external_id);
  }

  if (storageProvider === "youtube") {
    return fetchYouTubeVideoInfo(submission.external_id);
  }

  throw new Error("该投稿来源不需要抓取外部元数据。");
}

export async function listDictionaryItems(supabase: SupabaseClient, table: "categories" | "tags") {
  const orderColumn = table === "categories" ? "sort_order" : "name";
  const { data, error } = await supabase
    .from(table)
    .select(table === "categories" ? "id,name,sort_order,created_at" : "id,name,created_at")
    .order(orderColumn, { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as DictionaryItem[];
}

export async function listToneItems(supabase: SupabaseClient) {
  const items: DictionaryItem[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("tones")
      .select("id,name,color_hex,created_at").order("name").order("id")
      .range(from, from + pageSize - 1);
    if (error?.code === "PGRST103") {return items;}
    if (error) {throw new Error(error.message);}
    const page = (data ?? []) as DictionaryItem[];
    items.push(...page);
    if (page.length < pageSize) {return items;}
  }
}

export async function listAllDictionaries(supabase: SupabaseClient) {
  const [categories, tags] = await Promise.all([
    listDictionaryItems(supabase, "categories"),
    listDictionaryItems(supabase, "tags"),
  ]);

  return { categories, tags };
}

export async function listHomeHeroFeatureRequests(supabase: SupabaseClient, {
  status = "pending", page = 1, pageSize = 20,
}: { status?: HomeHeroStatusFilter; page?: number; pageSize?: number } = {}) {
  status = coerceHomeHeroStatus(status);
  page = coerceSubmissionPage(page);
  pageSize = Number.isSafeInteger(pageSize) ? Math.min(100, Math.max(1, pageSize)) : 20;
  const from = (page - 1) * pageSize;
  // Existing FKs allow PostgREST to return a request and its associated records in one read.
  const columns = "submission_id,status,created_at,submission:submissions!inner(id,status,created_at,pending_title,source_url,source_ref,external_id,video:videos(id,submission_id,title,cover_url,published_at,created_at))";
  const filteredQuery = (head = false) => {
    let request = supabase.from("home_hero_feature_requests").select(head ? "submission_id,submission:submissions!inner(id)" : columns, { count: "exact", head });
    if (status !== "all") {
      request = request.eq("status", status);
    }
    return request;
  };
  const { data, error, count } = await filteredQuery()
    .order("created_at", { ascending: false })
    .order("submission_id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    if (error.code === OUT_OF_RANGE_CODE) {
      const counted = count === null ? await filteredQuery(true) : { count, error: null };
      if (counted.error) {
        throw new Error(counted.error.message);
      }
      return { rows: [] as HomeHeroFeatureRequestRow[], total: counted.count ?? 0 };
    }
    throw new Error(error.message);
  }
  const rows = (data as unknown as HomeHeroFeatureRequestTableRow[] ?? [])
    .map((request): HomeHeroFeatureRequestRow => {
      const submission = request.submission;
      const video = Array.isArray(submission.video) ? submission.video[0] : submission.video;
      const title =
        video?.title ??
        submission.pending_title ??
        submission.source_ref ??
        submission.source_url ??
        submission.external_id;

      return {
        cover_url: video?.cover_url ?? null,
        created_at: request.created_at,
        published_at: video?.published_at ?? null,
        request_status: request.status,
        source_ref: submission.source_ref,
        source_url: submission.source_url,
        submission_created_at: submission.created_at,
        submission_id: request.submission_id,
        submission_status: submission.status,
        title,
        video_id: video?.id ?? null,
      };
    });
  return { rows, total: count ?? 0 };
}

export async function ensureSubmissionMetadata(
  supabase: SupabaseClient,
  submission: SubmissionRow,
) {
  if (!isExternalSubmission(submission)) {
    return { info: null, error: null, fetched: false };
  }

  const cached = asReviewFetchedMeta(submission.auto_fetched_meta);

  if (cached && submission.fetched_at) {
    return { info: cached, error: null, fetched: false };
  }

  if (submission.fetch_error) {
    return { info: null, error: submission.fetch_error, fetched: false };
  }

  try {
    const info = await fetchExternalSubmissionMetadata(submission);
    const { error } = await supabase
      .from("submissions")
      .update({
        auto_fetched_meta: info,
        fetched_at: new Date().toISOString(),
        fetch_error: null,
      })
      .eq("id", submission.id);

    if (error) {
      throw new Error(error.message);
    }

    return { info, error: null, fetched: true };
  } catch (error) {
    const message = getSafeActionMessage(error);
    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        fetch_error: message,
        fetched_at: null,
      })
      .eq("id", submission.id);

    if (updateError) {
      return { info: null, error: updateError.message, fetched: false };
    }

    return { info: null, error: message, fetched: false };
  }
}

// Call only after admin authorization: fetching metadata also updates submissions.
export async function ensureSubmissionListMetadata(
  supabase: SupabaseClient,
  rows: SubmissionListRow[],
) {
  const ids = rows.filter((row) =>
    row.status === "pending" && isExternalSubmission(row) &&
    !row.fetch_error && (!row.fetched_at || !row.fetched_title),
  ).map((row) => row.id);

  if (!ids.length) {
    return rows;
  }

  // Recheck the current records in one read so a refreshed cache or an already
  // reviewed submission is not fetched again based on an older list snapshot.
  const { data, error } = await supabase
    .from("submissions")
    .select(submissionSelectColumns)
    .in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
  const submissions = (data ?? []) as SubmissionRow[];
  const updated = new Map<string, Partial<SubmissionListRow>>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < submissions.length) {
      const submission = submissions[nextIndex++];
      if (submission.status !== "pending" || !isExternalSubmission(submission)) {
        continue;
      }

      try {
        const { info, error } = await ensureSubmissionMetadata(supabase, submission);
        updated.set(submission.id, {
          ...(info ? {
            fetched_title: info.title,
            fetched_cover: info.pic,
            fetched_author: info.ownerName,
            fetched_duration: info.duration,
          } : {}),
          fetched_at: info ? submission.fetched_at ?? new Date().toISOString() : null,
          fetch_error: error,
        });
      } catch (error) {
        // One unavailable source must not hide the other submissions in the queue.
        updated.set(submission.id, { fetch_error: getSafeActionMessage(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, submissions.length) }, worker));
  return rows.map((row) => updated.has(row.id) ? { ...row, ...updated.get(row.id) } : row);
}

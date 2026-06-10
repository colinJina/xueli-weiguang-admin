import { notFound } from "next/navigation";

import type { BilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";
import { fetchBilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";
import { getSafeActionMessage } from "@/lib/review/review-utils";
import type {
  DictionaryItem,
  PublishedVideoRow,
  SubmissionRow,
  SubmissionStorageProviderKind,
} from "@/lib/review/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const submissionSelectColumns =
  "id,user_id,platform,storage_provider,source_url,external_id,status,auto_fetched_meta,fetched_at,fetch_error,pending_title,pending_description,file_size,mime_type,source_ref,cover_ref,source_etag,cover_etag,reviewed_by,review_note,created_at,reviewed_at";

const statusOrder: Record<SubmissionRow["status"], number> = {
  pending: 0,
  rejected: 1,
  approved: 2,
};

export function asBilibiliVideoInfo(value: unknown): BilibiliVideoInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BilibiliVideoInfo>;
  const hasRequiredStrings =
    typeof candidate.title === "string" &&
    typeof candidate.pic === "string" &&
    typeof candidate.desc === "string" &&
    typeof candidate.ownerName === "string" &&
    typeof candidate.ownerAvatar === "string";
  const hasRequiredNumbers =
    typeof candidate.viewCount === "number" &&
    typeof candidate.likeCount === "number" &&
    typeof candidate.duration === "number" &&
    typeof candidate.pubdate === "number";

  return hasRequiredStrings && hasRequiredNumbers ? (candidate as BilibiliVideoInfo) : null;
}

export async function listSubmissions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("submissions")
    .select(submissionSelectColumns)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SubmissionRow[]).sort((a, b) => {
    const statusDelta = statusOrder[a.status] - statusOrder[b.status];
    return statusDelta || Date.parse(b.created_at) - Date.parse(a.created_at);
  });
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

export function isCosSubmission(submission: Pick<SubmissionRow, "platform" | "storage_provider">) {
  return getSubmissionStorageProvider(submission) === "cos";
}

export async function listDictionaryItems(supabase: SupabaseClient, table: string) {
  const orderColumn = table === "categories" ? "sort_order" : "name";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order(orderColumn, { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DictionaryItem[];
}

export async function listAllDictionaries(supabase: SupabaseClient) {
  const [categories, tags, tones] = await Promise.all([
    listDictionaryItems(supabase, "categories"),
    listDictionaryItems(supabase, "tags"),
    listDictionaryItems(supabase, "tones"),
  ]);

  return { categories, tags, tones };
}

export async function listPublishedVideos(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id,submission_id,platform,storage_provider,source_url,embed_url,playback_ref,title,cover_url,author_name,view_count,like_count,category_id,published_at,created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PublishedVideoRow[];
}

export async function ensureSubmissionMetadata(
  supabase: SupabaseClient,
  submission: SubmissionRow,
) {
  if (!isBilibiliSubmission(submission)) {
    return { info: null, error: null, fetched: false };
  }

  const cached = asBilibiliVideoInfo(submission.auto_fetched_meta);

  if (cached && submission.fetched_at) {
    return { info: cached, error: null, fetched: false };
  }

  if (submission.fetch_error) {
    return { info: null, error: submission.fetch_error, fetched: false };
  }

  try {
    const info = await fetchBilibiliVideoInfo(submission.external_id);
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

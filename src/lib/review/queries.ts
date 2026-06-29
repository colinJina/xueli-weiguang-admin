import { notFound } from "next/navigation";

import { fetchBilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";
import { fetchYouTubeVideoInfo } from "@/lib/youtube/fetch-video-info";
import {
  asReviewFetchedMeta,
  type ReviewFetchedMeta,
} from "@/lib/review/fetched-meta";
import { getSafeActionMessage } from "@/lib/review/review-utils";
import type {
  DictionaryItem,
  HomeHeroFeatureRequestRow,
  HomeHeroFeatureRequestStatus,
  PublishedVideoRow,
  SubmissionRow,
  SubmissionStatus,
  SubmissionStorageProviderKind,
  ToneFamilyItem,
} from "@/lib/review/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export { asReviewFetchedMeta };

const submissionSelectColumns =
  "id,user_id,platform,storage_provider,source_url,external_id,status,auto_fetched_meta,fetched_at,fetch_error,pending_title,pending_description,file_size,mime_type,source_ref,cover_ref,source_etag,cover_etag,reviewed_by,review_note,created_at,reviewed_at";

const statusOrder: Record<SubmissionRow["status"], number> = {
  pending: 0,
  rejected: 1,
  approved: 2,
};

const homeHeroRequestStatusOrder: Record<HomeHeroFeatureRequestStatus, number> = {
  pending: 0,
  applied: 1,
  rejected: 2,
};

type HomeHeroFeatureRequestTableRow = {
  submission_id: string;
  status: HomeHeroFeatureRequestStatus;
  created_at: string;
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

export async function listDictionaryItems(supabase: SupabaseClient, table: string) {
  const orderColumn = table === "categories" || table === "tone_families" ? "sort_order" : "name";
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

export async function listToneFamilies(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tone_families")
    .select("id,key,name,color_hex,sort_order,is_active,created_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ToneFamilyItem[];
}

export async function listToneItems(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tones")
    .select("id,name,color_hex,family_id,created_at")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const [tones, families] = [(data ?? []) as DictionaryItem[], await listToneFamilies(supabase)];
  const familyNameById = new Map(families.map((family) => [family.id, family.name]));

  return tones.map((tone) => ({
    ...tone,
    family_name: tone.family_id ? (familyNameById.get(tone.family_id) ?? null) : null,
  }));
}

export async function listAllDictionaries(supabase: SupabaseClient) {
  const [categories, tags, toneFamilies, tones] = await Promise.all([
    listDictionaryItems(supabase, "categories"),
    listDictionaryItems(supabase, "tags"),
    listToneFamilies(supabase),
    listToneItems(supabase),
  ]);

  return { categories, tags, toneFamilies, tones };
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

export async function listHomeHeroFeatureRequests(supabase: SupabaseClient) {
  const { data: requestData, error: requestError } = await supabase
    .from("home_hero_feature_requests")
    .select("submission_id,status,created_at")
    .order("created_at", { ascending: false });

  if (requestError) {
    throw new Error(requestError.message);
  }

  const requests = (requestData ?? []) as HomeHeroFeatureRequestTableRow[];
  const submissionIds = requests.map((request) => request.submission_id);

  if (submissionIds.length === 0) {
    return [];
  }

  const [submissionsResult, videosResult] = await Promise.all([
    supabase
      .from("submissions")
      .select("id,status,created_at,pending_title,source_url,source_ref,external_id")
      .in("id", submissionIds),
    supabase
      .from("videos")
      .select("id,submission_id,title,cover_url,published_at,created_at")
      .in("submission_id", submissionIds)
      .order("created_at", { ascending: false }),
  ]);

  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message);
  }

  if (videosResult.error) {
    throw new Error(videosResult.error.message);
  }

  const submissionsById = new Map(
    ((submissionsResult.data ?? []) as HomeHeroSubmissionSummaryRow[]).map((submission) => [
      submission.id,
      submission,
    ]),
  );
  const videosBySubmissionId = new Map<string, HomeHeroVideoSummaryRow>();

  for (const video of (videosResult.data ?? []) as HomeHeroVideoSummaryRow[]) {
    if (!videosBySubmissionId.has(video.submission_id)) {
      videosBySubmissionId.set(video.submission_id, video);
    }
  }

  return requests
    .map((request): HomeHeroFeatureRequestRow | null => {
      const submission = submissionsById.get(request.submission_id);

      if (!submission) {
        return null;
      }

      const video = videosBySubmissionId.get(request.submission_id);
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
    })
    .filter((request): request is HomeHeroFeatureRequestRow => request !== null)
    .sort((a, b) => {
      const statusDelta =
        homeHeroRequestStatusOrder[a.request_status] -
        homeHeroRequestStatusOrder[b.request_status];

      return statusDelta || Date.parse(b.created_at) - Date.parse(a.created_at);
    });
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

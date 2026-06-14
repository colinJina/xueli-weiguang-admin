import type { ReviewFetchedMeta } from "@/lib/review/fetched-meta";

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type SubmissionStorageProvider = "bilibili" | "youtube" | "cos";
export type SubmissionStorageProviderKind = SubmissionStorageProvider | "unsupported";
export type HomeHeroFeatureRequestStatus = "pending" | "applied" | "rejected";

export type SubmissionRow = {
  id: string;
  user_id: string;
  platform: string;
  storage_provider: SubmissionStorageProvider | string | null;
  source_url: string | null;
  external_id: string;
  status: SubmissionStatus;
  auto_fetched_meta: ReviewFetchedMeta | Record<string, never>;
  fetched_at: string | null;
  fetch_error: string | null;
  pending_title: string | null;
  pending_description: string | null;
  file_size: number | string | null;
  mime_type: string | null;
  source_ref: string | null;
  cover_ref: string | null;
  source_etag: string | null;
  cover_etag: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type DictionaryItem = {
  id: string;
  name: string;
  color_hex?: string | null;
  sort_order?: number;
  created_at: string;
};

export type PublishedVideoRow = {
  id: string;
  submission_id: string;
  platform: string;
  storage_provider: SubmissionStorageProvider | string | null;
  source_url: string | null;
  embed_url: string | null;
  playback_ref: string | null;
  title: string;
  cover_url: string | null;
  author_name: string | null;
  view_count: number;
  like_count: number;
  category_id: string;
  published_at: string | null;
  created_at: string;
};

export type HomeHeroFeatureRequestRow = {
  submission_id: string;
  request_status: HomeHeroFeatureRequestStatus;
  created_at: string;
  submission_status: SubmissionStatus;
  submission_created_at: string;
  title: string | null;
  source_url: string | null;
  source_ref: string | null;
  video_id: string | null;
  cover_url: string | null;
  published_at: string | null;
};

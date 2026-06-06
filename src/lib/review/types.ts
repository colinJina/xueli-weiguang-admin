import type { BilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type SubmissionRow = {
  id: string;
  user_id: string;
  platform: "bilibili";
  source_url: string;
  external_id: string;
  status: SubmissionStatus;
  auto_fetched_meta: BilibiliVideoInfo | Record<string, never>;
  fetched_at: string | null;
  fetch_error: string | null;
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
  source_url: string;
  embed_url: string;
  title: string;
  cover_url: string | null;
  author_name: string | null;
  view_count: number;
  like_count: number;
  category_id: string;
  published_at: string | null;
  created_at: string;
};

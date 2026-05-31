"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { BilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";
import { fetchBilibiliVideoInfo } from "@/lib/bilibili/fetch-video-info";
import { requireAdmin } from "@/lib/admin/auth";
import { getSubmissionOrNotFound } from "@/lib/review/queries";
import {
  buildBilibiliEmbedUrl,
  coerceOptionalReviewNote,
  coerceSelectedIds,
  getSafeActionMessage,
  normalizeDictionaryName,
} from "@/lib/review/review-utils";
import type { SubmissionRow } from "@/lib/review/types";

type DictionaryKind = "categories" | "tags" | "tones";

const dictionaryPaths: Record<DictionaryKind, string> = {
  categories: "/dashboard/categories",
  tags: "/dashboard/tags",
  tones: "/dashboard/tones",
};

function redirectWithMessage(path: string, key: "error" | "notice", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

function getStringField(formData: FormData, fieldName: string) {
  return String(formData.get(fieldName) ?? "").trim();
}

async function fetchAndPersistMetadata(submission: SubmissionRow) {
  const { supabase } = await requireAdmin();

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

    return info;
  } catch (error) {
    const message = getSafeActionMessage(error);
    await supabase
      .from("submissions")
      .update({
        fetch_error: message,
        fetched_at: null,
      })
      .eq("id", submission.id);
    throw new Error(message);
  }
}

function readMetadata(submission: SubmissionRow): BilibiliVideoInfo {
  const meta = submission.auto_fetched_meta as Partial<BilibiliVideoInfo>;

  if (
    typeof meta.title !== "string" ||
    typeof meta.pic !== "string" ||
    typeof meta.desc !== "string" ||
    typeof meta.ownerName !== "string" ||
    typeof meta.ownerAvatar !== "string" ||
    typeof meta.viewCount !== "number" ||
    typeof meta.likeCount !== "number" ||
    typeof meta.duration !== "number" ||
    typeof meta.pubdate !== "number"
  ) {
    throw new Error("Fetch metadata before approving.");
  }

  return meta as BilibiliVideoInfo;
}

export async function retryMetadataFetch(formData: FormData) {
  const id = getStringField(formData, "submissionId");
  const path = `/dashboard/submissions/${id}`;

  try {
    const { supabase } = await requireAdmin();
    const submission = await getSubmissionOrNotFound(supabase, id);
    await fetchAndPersistMetadata(submission);
    revalidatePath(path);
    redirectWithMessage(path, "notice", "Metadata fetched.");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function approveSubmission(formData: FormData) {
  const id = getStringField(formData, "submissionId");
  const path = `/dashboard/submissions/${id}`;
  let createdVideoId: string | null = null;

  try {
    const { supabase, user } = await requireAdmin();
    const submission = await getSubmissionOrNotFound(supabase, id);

    if (submission.status !== "pending") {
      throw new Error("Only pending submissions can be approved.");
    }

    const categoryId = getStringField(formData, "categoryId");

    if (!categoryId) {
      throw new Error("Category is required.");
    }

    const tagIds = coerceSelectedIds(formData, "tagIds", 4);
    const toneIds = coerceSelectedIds(formData, "toneIds", 3);
    const reviewNote = coerceOptionalReviewNote(formData.get("reviewNote"));
    const metadata = readMetadata(submission);

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .insert({
        submission_id: submission.id,
        platform: "bilibili",
        source_url: submission.source_url,
        embed_url: buildBilibiliEmbedUrl(submission.external_id),
        title: metadata.title,
        cover_url: metadata.pic,
        description: metadata.desc,
        author_name: metadata.ownerName,
        author_avatar: metadata.ownerAvatar,
        view_count: metadata.viewCount,
        like_count: metadata.likeCount,
        category_id: categoryId,
        submitted_by: submission.user_id,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (videoError) {
      throw new Error(videoError.message);
    }

    createdVideoId = video.id as string;

    if (tagIds.length) {
      const { error } = await supabase.from("video_tags").insert(
        tagIds.map((tagId) => ({
          video_id: createdVideoId,
          tag_id: tagId,
        })),
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    if (toneIds.length) {
      const { error } = await supabase.from("video_tones").insert(
        toneIds.map((toneId) => ({
          video_id: createdVideoId,
          tone_id: toneId,
        })),
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    const { error: submissionError } = await supabase
      .from("submissions")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("id", submission.id);

    if (submissionError) {
      throw new Error(submissionError.message);
    }

    revalidatePath("/dashboard/submissions");
    revalidatePath("/dashboard/videos");
    redirectWithMessage("/dashboard/submissions", "notice", "Submission approved.");
  } catch (error) {
    if (createdVideoId) {
      const { supabase } = await requireAdmin();
      await supabase.from("videos").delete().eq("id", createdVideoId);
    }

    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function rejectSubmission(formData: FormData) {
  const id = getStringField(formData, "submissionId");
  const path = `/dashboard/submissions/${id}`;

  try {
    const { supabase, user } = await requireAdmin();
    const reviewNote = coerceOptionalReviewNote(formData.get("reviewNote"));
    const { error } = await supabase
      .from("submissions")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/dashboard/submissions");
    redirectWithMessage("/dashboard/submissions", "notice", "Submission rejected.");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function addDictionaryItem(kind: DictionaryKind, formData: FormData) {
  const path = dictionaryPaths[kind];

  try {
    const { supabase } = await requireAdmin();
    const name = normalizeDictionaryName(formData.get("name"));
    const { error } = await supabase.from(kind).insert({ name });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "Item added.");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function deleteDictionaryItem(kind: DictionaryKind, formData: FormData) {
  const path = dictionaryPaths[kind];

  try {
    const { supabase } = await requireAdmin();
    const id = getStringField(formData, "id");

    if (!id) {
      throw new Error("Item id is required.");
    }

    const { error } = await supabase.from(kind).delete().eq("id", id);

    if (error) {
      throw new Error(
        error.code === "23503" ? "Item is used by a published video." : error.message,
      );
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "Item deleted.");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

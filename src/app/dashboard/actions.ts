"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/auth";
import {
  deletePublishedVideoRecord,
  type DeletePublishedVideoSupabaseClient,
} from "@/lib/review/delete-published-video";
import {
  fetchExternalSubmissionMetadata,
  getSubmissionById,
  getSubmissionOrNotFound,
  getSubmissionStorageProvider,
  isExternalSubmission,
} from "@/lib/review/queries";
import {
  coerceOptionalReviewNote,
  coerceSelectedIds,
  getSafeActionMessage,
  normalizeDictionaryName,
  normalizeSortOrder,
  normalizeToneColor,
  normalizeToneFamilyId,
  normalizeToneFamilyKey,
} from "@/lib/review/review-utils";
import type { SubmissionRow } from "@/lib/review/types";
import { publishCosSubmission } from "@/lib/storage/cos/publish";

type DictionaryKind = "categories" | "tags" | "tone_families" | "tones";

const dictionaryPaths: Record<DictionaryKind, string> = {
  categories: "/dashboard/categories",
  tags: "/dashboard/tags",
  tone_families: "/dashboard/tone-families",
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

  if (!isExternalSubmission(submission)) {
    throw new Error("该投稿来源不需要抓取外部元数据。");
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

export async function retryMetadataFetch(formData: FormData) {
  const id = getStringField(formData, "submissionId");
  const path = `/dashboard/submissions/${id}`;

  try {
    const { supabase } = await requireAdmin();
    const submission = await getSubmissionOrNotFound(supabase, id);
    await fetchAndPersistMetadata(submission);
    revalidatePath(path);
    redirectWithMessage(path, "notice", "元数据已获取。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function approveSubmission(formData: FormData) {
  const id = getStringField(formData, "submissionId");
  const path = `/dashboard/submissions/${id}`;

  try {
    const { supabase } = await requireAdmin();
    const submission = await getSubmissionById(supabase, id);

    if (!submission) {
      throw new Error("投稿不存在。");
    }

    if (submission.status !== "pending") {
      throw new Error("只能审核待处理投稿。");
    }

    const categoryId = getStringField(formData, "categoryId");

    if (!categoryId) {
      throw new Error("必须选择分类。");
    }

    const tagIds = coerceSelectedIds(formData, "tagIds", 4);
    const toneIds = coerceSelectedIds(formData, "toneIds", 3);
    const reviewNote = coerceOptionalReviewNote(formData.get("reviewNote"));
    const storageProvider = getSubmissionStorageProvider(submission);

    if (storageProvider === "bilibili" || storageProvider === "youtube") {
      const { error } = await supabase.rpc("approve_submission", {
        p_submission_id: submission.id,
        p_category_id: categoryId,
        p_tag_ids: tagIds,
        p_tone_ids: toneIds,
        p_review_note: reviewNote,
      });

      if (error) {
        throw new Error(error.message);
      }
    } else if (storageProvider === "cos") {
      await publishCosSubmission({
        supabase,
        submission,
        categoryId,
        tagIds,
        toneIds,
        reviewNote,
      });
    } else {
      throw new Error("不支持的投稿来源。");
    }

    revalidatePath("/dashboard/submissions");
    revalidatePath("/dashboard/videos");
    redirectWithMessage("/dashboard/submissions", "notice", "投稿已通过。");
  } catch (error) {
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

    const { data: pendingHeroRequest, error: pendingHeroRequestError } = await supabase
      .from("home_hero_feature_requests")
      .select("submission_id")
      .eq("submission_id", id)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingHeroRequestError) {
      throw new Error(pendingHeroRequestError.message);
    }

    if (pendingHeroRequest) {
      const { error: rejectHeroRequestError } = await supabase.rpc(
        "reject_home_hero_feature_request",
        {
          p_submission_id: id,
        },
      );

      if (rejectHeroRequestError) {
        throw new Error(rejectHeroRequestError.message);
      }
    }

    revalidatePath("/dashboard/submissions");
    revalidatePath("/dashboard/home-hero");
    redirectWithMessage("/dashboard/submissions", "notice", "投稿已拒绝。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function applyHomeHeroFeatureRequest(formData: FormData) {
  const submissionId = getStringField(formData, "submissionId");
  const path = "/dashboard/home-hero";

  try {
    if (!submissionId) {
      throw new Error("缺少投稿 ID。");
    }

    const { supabase } = await requireAdmin();
    const { error } = await supabase.rpc("apply_home_hero_feature_request", {
      p_submission_id: submissionId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "已设为首页精选。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function rejectHomeHeroFeatureRequest(formData: FormData) {
  const submissionId = getStringField(formData, "submissionId");
  const path = "/dashboard/home-hero";

  try {
    if (!submissionId) {
      throw new Error("缺少投稿 ID。");
    }

    const { supabase } = await requireAdmin();
    const { error } = await supabase.rpc("reject_home_hero_feature_request", {
      p_submission_id: submissionId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "已拒绝首页精选申请。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function deletePublishedVideo(formData: FormData) {
  const id = getStringField(formData, "videoId");
  const confirmDelete = getStringField(formData, "confirmDelete");
  const path = "/dashboard/videos";

  try {
    if (confirmDelete !== "confirmed") {
      throw new Error("删除前必须勾选确认。");
    }

    const { supabase } = await requireAdmin();
    await deletePublishedVideoRecord({
      supabase: supabase as unknown as DeletePublishedVideoSupabaseClient,
      videoId: id,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/videos");
    revalidatePath("/dashboard/home-hero");
    revalidatePath("/dashboard/submissions");
    redirectWithMessage(path, "notice", "视频已删除。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function addDictionaryItem(kind: DictionaryKind, formData: FormData) {
  const path = dictionaryPaths[kind];

  try {
    const { supabase } = await requireAdmin();
    let error: { message: string } | null;

    if (kind === "tones") {
      const name = normalizeDictionaryName(formData.get("name"));
      const manualColorHex = getStringField(formData, "manualColorHex");
      const colorHex = normalizeToneColor(manualColorHex || formData.get("colorHex"));
      const familyId = normalizeToneFamilyId(formData.get("familyId"));
      ({ error } = await supabase
        .from("tones")
        .insert({ color_hex: colorHex, family_id: familyId, name }));
    } else if (kind === "tone_families") {
      const manualColorHex = getStringField(formData, "manualColorHex");
      const colorHex = normalizeToneColor(manualColorHex || formData.get("colorHex"));
      ({ error } = await supabase.from("tone_families").insert({
        color_hex: colorHex,
        is_active: true,
        key: normalizeToneFamilyKey(formData.get("key")),
        name: normalizeDictionaryName(formData.get("name")),
        sort_order: normalizeSortOrder(formData.get("sortOrder")),
      }));
    } else {
      ({ error } = await supabase
        .from(kind)
        .insert({ name: normalizeDictionaryName(formData.get("name")) }));
    }

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "条目已添加。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function updateToneItem(formData: FormData) {
  const path = dictionaryPaths.tones;

  try {
    const { supabase } = await requireAdmin();
    const id = getStringField(formData, "id");

    if (!id) {
      throw new Error("缺少条目 ID。");
    }

    const manualColorHex = getStringField(formData, "manualColorHex");
    const colorHex = normalizeToneColor(manualColorHex || formData.get("colorHex"));
    const { error } = await supabase
      .from("tones")
      .update({
        color_hex: colorHex,
        family_id: normalizeToneFamilyId(formData.get("familyId")),
        name: normalizeDictionaryName(formData.get("name")),
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "色调已更新。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

export async function updateToneFamilyItem(formData: FormData) {
  const path = dictionaryPaths.tone_families;

  try {
    const { supabase } = await requireAdmin();
    const id = getStringField(formData, "id");

    if (!id) {
      throw new Error("缺少条目 ID。");
    }

    const manualColorHex = getStringField(formData, "manualColorHex");
    const colorHex = normalizeToneColor(manualColorHex || formData.get("colorHex"));
    const { error } = await supabase
      .from("tone_families")
      .update({
        color_hex: colorHex,
        is_active: formData.get("isActive") === "on",
        key: normalizeToneFamilyKey(formData.get("key")),
        name: normalizeDictionaryName(formData.get("name")),
        sort_order: normalizeSortOrder(formData.get("sortOrder")),
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "色族已更新。");
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
      throw new Error("缺少条目 ID。");
    }

    const { error } = await supabase.from(kind).delete().eq("id", id);

    if (error) {
      throw new Error(
        error.code === "23503" ? "该条目已被已发布视频使用。" : error.message,
      );
    }

    revalidatePath(path);
    redirectWithMessage(path, "notice", "条目已删除。");
  } catch (error) {
    redirectWithMessage(path, "error", getSafeActionMessage(error));
  }
}

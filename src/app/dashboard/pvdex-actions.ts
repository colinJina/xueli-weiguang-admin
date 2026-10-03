"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireAdminForAction } from "@/lib/admin/auth";
import { getPvdexSuggestions, refreshPvdexCatalog } from "@/lib/pvdex/catalog";
import type { PvdexSuggestionResult } from "@/lib/pvdex/types";
import { createOrReuseReviewDictionaryItem } from "@/lib/review/dictionary-write";
import type { CreateReviewDictionaryInput } from "@/lib/review/dictionary-write";
import { getSubmissionById, isExternalSubmission, listAllDictionaries } from "@/lib/review/queries";
import { getSafeActionMessage } from "@/lib/review/review-utils";
import type { DictionaryItem } from "@/lib/review/types";

export type CreatePvdexDictionaryInput = CreateReviewDictionaryInput & { submissionId: string };
export type CreatePvdexDictionaryResult =
  | { ok: true; item: DictionaryItem; reused: boolean }
  | { ok: false; error: string };

type ActionSupabaseClient = Awaited<ReturnType<typeof requireAdminForAction>>["supabase"];

async function getPendingExternalSubmission(supabase: ActionSupabaseClient, submissionId: string) {
  if (typeof submissionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new Error("投稿不存在。");
  }
  const submission = await getSubmissionById(supabase, submissionId);
  if (!submission) {
    throw new Error("投稿不存在。");
  }
  if (submission.status !== "pending") {
    throw new Error("只能为待审核投稿处理建议。");
  }
  if (!isExternalSubmission(submission)) {
    throw new Error("该投稿来源不支持 PVDex 建议。");
  }
  return submission;
}

export async function refreshPvdexSuggestions(submissionId: string): Promise<PvdexSuggestionResult> {
  try {
    const { supabase } = await requireAdminForAction();
    const submission = await getPendingExternalSubmission(supabase, submissionId);
    await refreshPvdexCatalog();
    const dictionaries = await listAllDictionaries(supabase);
    return await getPvdexSuggestions(submission, dictionaries);
  } catch (error) {
    unstable_rethrow(error);
    return { status: "unavailable", message: getSafeActionMessage(error) };
  }
}

export async function createPvdexDictionaryItem(
  input: CreatePvdexDictionaryInput,
): Promise<CreatePvdexDictionaryResult> {
  try {
    const { supabase } = await requireAdminForAction();
    if (!input || typeof input !== "object") {
      throw new Error("词条参数无效。");
    }
    await getPendingExternalSubmission(supabase, input.submissionId);
    const { item, reused } = await createOrReuseReviewDictionaryItem(supabase, input);
    if (!reused) {
      // Do not invalidate the active detail page: its unsaved review choices
      // stay in the client component and the action returns the new row.
      revalidatePath(input.kind === "tags" ? "/dashboard/tags" : "/dashboard/tones");
      revalidatePath("/dashboard/submissions");
    }
    return { ok: true, item, reused };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: getSafeActionMessage(error) };
  }
}

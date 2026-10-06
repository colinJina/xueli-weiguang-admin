import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { getAdminContext } from "@/lib/admin/auth";
import { getPvdexSuggestions } from "@/lib/pvdex/catalog";
import { getSubmissionById, isExternalSubmission, listAllDictionaries } from "@/lib/review/queries";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user, isAdmin } = await getAdminContext();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401, headers });
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "仅管理员可以读取审核建议。" }, { status: 403, headers });
    }
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "投稿不存在。" }, { status: 404, headers });
    }
    const submission = await getSubmissionById(supabase, id);
    if (!submission) {
      return NextResponse.json({ error: "投稿不存在。" }, { status: 404, headers });
    }
    if (!isExternalSubmission(submission)) {
      return NextResponse.json({ status: "unsupported", message: "该投稿来源不支持 PVDex 建议。" }, { headers });
    }
    const dictionaries = await listAllDictionaries(supabase);
    const result = await getPvdexSuggestions(submission, dictionaries);
    return NextResponse.json(result, { headers });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ status: "unavailable", message: "建议加载失败，请重试。" }, { status: 503, headers });
  }
}

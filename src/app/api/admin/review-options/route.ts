import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { loadAdminPageData } from "@/lib/admin/auth";
import { listAllDictionaries } from "@/lib/review/queries";

export async function GET() {
  try {
    const { categories, tags } = await loadAdminPageData(listAllDictionaries);
    return NextResponse.json(
      {
        categories: categories.map(({ id, name }) => ({ id, name })),
        tags: tags.map(({ id, name }) => ({ id, name })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ error: "审核选项加载失败，请重试。" }, { status: 503 });
  }
}

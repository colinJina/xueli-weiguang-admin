import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";

export const metadata = {
  title: "标签",
};

type TagsPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function TagsPage({ searchParams }: TagsPageProps) {
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const items = await listDictionaryItems(supabase, "tags");

  return (
    <DictionaryPage
      description="每个通过审核的视频最多可使用四个标签。"
      error={error}
      items={items}
      kind="tags"
      notice={notice}
      title="标签"
    />
  );
}

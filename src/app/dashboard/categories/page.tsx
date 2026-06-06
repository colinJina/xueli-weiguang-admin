import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";

export const metadata = {
  title: "分类",
};

type CategoriesPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const items = await listDictionaryItems(supabase, "categories");

  return (
    <DictionaryPage
      description="每个通过审核的视频必须分配一个分类。"
      error={error}
      items={items}
      kind="categories"
      notice={notice}
      title="分类"
    />
  );
}

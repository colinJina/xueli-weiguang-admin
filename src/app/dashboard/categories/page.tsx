import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { loadAdminPageData } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";
import { normalizeSearch } from "@/lib/review/menu-navigation";

export const metadata = {
  title: "分类",
};

type CategoriesPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
  }>;
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const [{ error, notice, q }, items] = await Promise.all([
    searchParams,
    loadAdminPageData((supabase) => listDictionaryItems(supabase, "categories")),
  ]);

  return (
    <DictionaryPage
      description="每个通过审核的视频必须分配一个分类。"
      error={error}
      items={items}
      kind="categories"
      notice={notice}
      query={normalizeSearch(q)}
      title="分类"
    />
  );
}

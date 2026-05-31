import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";

export const metadata = {
  title: "Categories",
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
      description="One required category is assigned to each approved video."
      error={error}
      items={items}
      kind="categories"
      notice={notice}
      title="Categories"
    />
  );
}

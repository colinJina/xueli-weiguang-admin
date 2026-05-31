import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";

export const metadata = {
  title: "Tags",
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
      description="Approved videos may use up to four tags."
      error={error}
      items={items}
      kind="tags"
      notice={notice}
      title="Tags"
    />
  );
}

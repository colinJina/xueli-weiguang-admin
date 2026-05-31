import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";

export const metadata = {
  title: "Tones",
};

type TonesPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function TonesPage({ searchParams }: TonesPageProps) {
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const items = await listDictionaryItems(supabase, "tones");

  return (
    <DictionaryPage
      description="Approved videos may use up to three tones."
      error={error}
      items={items}
      kind="tones"
      notice={notice}
      title="Tones"
    />
  );
}

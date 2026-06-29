import { TonesPage as TonesDictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listToneFamilies, listToneItems } from "@/lib/review/queries";

export const metadata = {
  title: "色调",
};

type TonesPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function TonesPage({ searchParams }: TonesPageProps) {
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const [families, items] = await Promise.all([listToneFamilies(supabase), listToneItems(supabase)]);

  return (
    <TonesDictionaryPage
      error={error}
      families={families}
      items={items}
      notice={notice}
    />
  );
}

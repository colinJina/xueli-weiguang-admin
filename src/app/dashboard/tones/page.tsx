import { TonesPage as TonesDictionaryPage } from "@/components/dashboard/dictionary-page";
import { loadAdminPageData } from "@/lib/admin/auth";
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
  const [{ error, notice }, [families, items]] = await Promise.all([
    searchParams,
    loadAdminPageData((supabase) => {
      const familiesPromise = listToneFamilies(supabase);
      return Promise.all([familiesPromise, listToneItems(supabase, familiesPromise)]);
    }),
  ]);

  return (
    <TonesDictionaryPage
      error={error}
      families={families}
      items={items}
      notice={notice}
    />
  );
}

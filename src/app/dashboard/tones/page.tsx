import { DictionaryPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
import { listDictionaryItems } from "@/lib/review/queries";

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
  const items = await listDictionaryItems(supabase, "tones");

  return (
    <DictionaryPage
      description="每个通过审核的视频最多可使用三个色调。"
      error={error}
      items={items}
      kind="tones"
      notice={notice}
      title="色调"
    />
  );
}

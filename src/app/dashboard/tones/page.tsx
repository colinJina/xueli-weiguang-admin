import { Suspense } from "react";

import { TonesPage as TonesDictionaryPage } from "@/components/dashboard/dictionary-page";
import { MenuLoading } from "@/components/dashboard/menu-loading";
import { loadAdminPageData } from "@/lib/admin/auth";
import { listToneFamilies, listToneItems } from "@/lib/review/queries";
import { normalizeSearch } from "@/lib/review/menu-navigation";

export const metadata = {
  title: "色调",
};

type TonesPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
    family?: string;
  }>;
};

export default async function TonesPage({ searchParams }: TonesPageProps) {
  const params = await searchParams;
  return (
    <Suspense fallback={<MenuLoading />} key={JSON.stringify(params)}>
      <TonesContent params={params} />
    </Suspense>
  );
}

async function TonesContent({ params: { error, notice, q, family } }: { params: Awaited<TonesPageProps["searchParams"]> }) {
  const [families, items] = await loadAdminPageData((supabase) => {
      const familiesPromise = listToneFamilies(supabase);
      return Promise.all([familiesPromise, listToneItems(supabase, familiesPromise)]);
  });

  return (
    <TonesDictionaryPage
      error={error}
      families={families}
      items={items}
      notice={notice}
      query={normalizeSearch(q)}
      familyId={family === "unassigned" || families.some((item) => item.id === family) ? family! : ""}
    />
  );
}

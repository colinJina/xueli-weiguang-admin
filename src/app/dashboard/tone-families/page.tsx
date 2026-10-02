import { ToneFamiliesPage } from "@/components/dashboard/dictionary-page";
import { loadAdminPageData } from "@/lib/admin/auth";
import { listToneFamilies } from "@/lib/review/queries";
import { normalizeSearch } from "@/lib/review/menu-navigation";

export const metadata = {
  title: "色族",
};

type ToneFamiliesRouteProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
    active?: string;
  }>;
};

export default async function ToneFamiliesRoute({ searchParams }: ToneFamiliesRouteProps) {
  const [{ error, notice, q, active }, families] = await Promise.all([
    searchParams,
    loadAdminPageData(listToneFamilies),
  ]);

  return <ToneFamiliesPage active={active === "enabled" || active === "disabled" ? active : "all"} error={error} families={families} notice={notice} query={normalizeSearch(q)} />;
}

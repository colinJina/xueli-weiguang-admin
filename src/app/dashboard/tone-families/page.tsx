import { ToneFamiliesPage } from "@/components/dashboard/dictionary-page";
import { loadAdminPageData } from "@/lib/admin/auth";
import { listToneFamilies } from "@/lib/review/queries";

export const metadata = {
  title: "色族",
};

type ToneFamiliesRouteProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function ToneFamiliesRoute({ searchParams }: ToneFamiliesRouteProps) {
  const [{ error, notice }, families] = await Promise.all([
    searchParams,
    loadAdminPageData(listToneFamilies),
  ]);

  return <ToneFamiliesPage error={error} families={families} notice={notice} />;
}

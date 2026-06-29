import { ToneFamiliesPage } from "@/components/dashboard/dictionary-page";
import { requireAdmin } from "@/lib/admin/auth";
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
  const [{ error, notice }, { supabase }] = await Promise.all([searchParams, requireAdmin()]);
  const families = await listToneFamilies(supabase);

  return <ToneFamiliesPage error={error} families={families} notice={notice} />;
}

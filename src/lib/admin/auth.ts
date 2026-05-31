import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: {
    id: string;
    email?: string;
  };
};

export async function getAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, isAdmin: false };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email,
    },
    isAdmin: Boolean(profile?.is_admin),
  };
}

export async function requireAdmin(): Promise<AdminContext> {
  const context = await getAdminContext();

  if (!context.user) {
    redirect("/login");
  }

  if (!context.isAdmin) {
    redirect("/login?error=not_admin");
  }

  return {
    supabase: context.supabase,
    user: context.user,
  };
}
